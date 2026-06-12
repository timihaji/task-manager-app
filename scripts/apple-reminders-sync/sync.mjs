#!/usr/bin/env node
// Apple Reminders -> Task Manager (Supabase) one-way pull-and-archive helper.
//
// macOS-only. Reads incomplete reminders via JXA, upserts them into the
// Supabase `tasks` table tagged source='apple-reminders' (source_id = the
// reminder's stable UUID, for dedup), then marks each imported reminder
// completed in Apple Reminders so it drops out of your active list and is
// never re-pulled.
//
// Auth: signs in as you with email/password, so all writes go through the
// app's normal RLS (auth.uid() = user_id). No service-role key needed.
//
// Usage:
//   node scripts/apple-reminders-sync/sync.mjs [options]
//
// Options:
//   --list "Name"     Only pull this Reminders list (repeatable). Default: all.
//   --project ID      Task Manager context to file imports under (LIFE/HOME/
//                     WORK/ADMIN). Default: LIFE (or TM_PROJECT env).
//   --dry-run         Read + print what would happen; no DB writes, no completes.
//   --no-complete     Import into Supabase but DON'T complete the reminders.
//
// Config (from process.env or a .env file at the repo root):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY   (reused from the web app's .env)
//   TM_EMAIL, TM_PASSWORD                        (your Task Manager login)
//   TM_PROJECT                                   (optional default context)
//   REMINDERS_LISTS                              (optional comma-separated lists)

import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const JXA_DIR = join(__dirname, 'jxa');

// --- tiny .env loader (no dotenv dependency) --------------------------------
// Reads KEY=VALUE lines from the repo-root .env. process.env always wins so
// you can override on the command line. Quotes around values are stripped.
function loadEnv() {
  const envPath = join(REPO_ROOT, '.env');
  const env = { ...process.env };
  if (!existsSync(envPath)) return env;
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (key in env) continue; // process.env wins
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// --- arg parsing ------------------------------------------------------------
function parseArgs(argv) {
  const opts = { lists: [], project: null, dryRun: false, complete: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--no-complete') opts.complete = false;
    else if (a === '--list') opts.lists.push(argv[++i]);
    else if (a.startsWith('--list=')) opts.lists.push(a.slice(7));
    else if (a === '--project') opts.project = argv[++i];
    else if (a.startsWith('--project=')) opts.project = a.slice(10);
    else { console.error(`Unknown option: ${a}`); process.exit(2); }
  }
  return opts;
}

// --- helpers ----------------------------------------------------------------
// Apple's Reminders UI sets 1 (high), 5 (medium), 9 (low), 0 (none), but the
// underlying field is a 0-9 scale. Bucket the whole range so an off-canonical
// value (e.g. priority 4) still maps sensibly instead of defaulting to p3.
function mapPriority(p) {
  const n = Number(p) || 0;
  if (n >= 1 && n <= 4) return 'p1';
  if (n === 5) return 'p2';
  if (n >= 6 && n <= 9) return 'p3';
  return 'p3'; // 0 / none
}

// Local YYYY-MM-DD (the app stores scheduled days in the user's local tz).
function localDayStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function runJxa(scriptFile, args = []) {
  const out = execFileSync(
    'osascript',
    ['-l', 'JavaScript', join(JXA_DIR, scriptFile), ...args],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  return out;
}

// Reminder -> Supabase task row. Stable id (ar_<uuid>) makes upserts
// idempotent and won't perturb the app's `t<n>` id counter.
function reminderToRow(r, userId, workspaceId, project) {
  const id = 'ar_' + String(r.id).replace(/[^a-zA-Z0-9]/g, '');
  let date = null;
  if (r.dueDate) {
    const d = new Date(r.dueDate);
    if (!Number.isNaN(d.getTime())) date = localDayStr(d);
  }
  const now = new Date().toISOString();
  return {
    id,
    user_id: userId,
    workspace_id: workspaceId,
    title: r.name || 'Untitled reminder',
    description: r.body || '',
    card_type: 'task',
    project,
    tags: [],
    priority: mapPriority(r.priority),
    date,                 // due day -> scheduled day; null lands it in the Inbox
    done: false,
    archived: false,
    source: 'apple-reminders',
    source_id: r.id,
    activity: [{ type: 'created', at: now, reason: 'apple-reminders import', list: r.list }],
  };
}

// --- main -------------------------------------------------------------------
async function main() {
  if (os.platform() !== 'darwin') {
    console.error('This helper must run on macOS — it drives Apple Reminders via osascript/JXA.');
    process.exit(1);
  }

  const env = loadEnv();
  const opts = parseArgs(process.argv.slice(2));

  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const email = env.TM_EMAIL;
  const password = env.TM_PASSWORD;
  const project = opts.project || env.TM_PROJECT || 'LIFE';
  const lists = opts.lists.length
    ? opts.lists
    : (env.REMINDERS_LISTS ? env.REMINDERS_LISTS.split(',').map(s => s.trim()).filter(Boolean) : []);

  if (!url || !anonKey) {
    console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (set in .env or env).');
    process.exit(1);
  }
  if (!email || !password) {
    console.error('Missing TM_EMAIL / TM_PASSWORD (your Task Manager login).');
    process.exit(1);
  }

  // 1. Read reminders.
  console.log(lists.length ? `Reading lists: ${lists.join(', ')}` : 'Reading all Reminders lists…');
  let reminders;
  try {
    reminders = JSON.parse(runJxa('read-reminders.js', lists) || '[]');
  } catch (e) {
    console.error('Failed to read reminders (is Automation permission granted?):', e.message);
    process.exit(1);
  }
  console.log(`Found ${reminders.length} incomplete reminder(s).`);
  if (!reminders.length) return;

  // 2. Sign in (respects RLS).
  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
  if (authErr) { console.error('Sign-in failed:', authErr.message); process.exit(1); }
  const userId = auth.user.id;

  // 3. Resolve the user's (first) workspace.
  const { data: ws, error: wsErr } = await supabase
    .from('workspaces').select('id').eq('user_id', userId)
    .order('created_at', { ascending: true }).limit(1);
  if (wsErr) { console.error('Workspace lookup failed:', wsErr.message); process.exit(1); }
  if (!ws || !ws[0]) { console.error('No workspace found for this account.'); process.exit(1); }
  const workspaceId = ws[0].id;

  // 4. Dedup against already-imported reminders (belt-and-suspenders: a prior
  //    run may have imported but failed to complete before exiting).
  const { data: existing, error: exErr } = await supabase
    .from('tasks').select('source_id')
    .eq('workspace_id', workspaceId).eq('source', 'apple-reminders');
  if (exErr) { console.error('Dedup query failed:', exErr.message); process.exit(1); }
  const seen = new Set((existing || []).map(e => e.source_id));
  const fresh = reminders.filter(r => !seen.has(r.id));
  console.log(`${fresh.length} new, ${reminders.length - fresh.length} already imported.`);
  if (!fresh.length) return;

  const rows = fresh.map(r => reminderToRow(r, userId, workspaceId, project));

  if (opts.dryRun) {
    console.log('\n--- DRY RUN (no writes) ---');
    for (const row of rows) {
      console.log(`  • ${row.title}  [${row.priority}${row.date ? ', ' + row.date : ''}] from "${fresh.find(f => f.id === row.source_id).list}"`);
    }
    return;
  }

  // 5. Upsert into Supabase.
  const { error: upErr } = await supabase.from('tasks').upsert(rows);
  if (upErr) { console.error('Upsert failed:', upErr.message); process.exit(1); }
  console.log(`Imported ${rows.length} task(s) into Task Manager.`);

  // 6. Archive (complete) the imported reminders in Apple Reminders.
  if (!opts.complete) {
    console.log('--no-complete set: reminders left active in Apple Reminders.');
    return;
  }
  try {
    const completed = runJxa('complete-reminders.js', fresh.map(r => r.id)).trim();
    console.log(`Completed ${completed} reminder(s) in Apple Reminders.`);
  } catch (e) {
    console.error('Import succeeded but completing reminders failed:', e.message);
    console.error('Re-running is safe — already-imported reminders are skipped via source_id.');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
