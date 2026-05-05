# Phase 2 Handoff — Cloud Sync Data Layer

You are picking up Phase 2 of a SaaS migration. Auth and Supabase scaffolding are
done. **Cloud sync (data layer) is not.** This document tells you everything you
need to do the next chunk without re-reading chat history.

---

## TL;DR

Users can sign up, sign in, and stay signed in. But once logged in, all task data
still lives in **browser localStorage**. Two devices = two separate task lists.

Your job: replace 8 localStorage keys with Supabase queries so data follows the
user across devices, then ship a one-time migration so existing local data
moves into the cloud.

---

## Verify the current state before starting

Run this first to make sure nothing has shifted since this doc was written:

```bash
git log --oneline -10
ls src/lib src/auth src/components | head
grep -rn "localStorage.getItem\|localStorage.setItem" src/ | wc -l
```

You should see:
- Recent commits include "Add login page with persistent Supabase session" and "Inject Supabase env vars into Pages build"
- `src/lib/supabase.js` exists; `src/lib/db.js` does **not**
- `src/auth/AuthProvider.jsx` exists with `useAuth()` hook
- ~19 `localStorage` calls remaining

If reality differs from the above, **stop and re-read the codebase** before assuming
the plan below still applies.

---

## What's already done (don't redo)

- ✅ Vite build pipeline, ES modules, component split (Phase 1, merged)
- ✅ Supabase project provisioned, schema applied, RLS enabled
  - URL: `https://luffkczrzqrmiamaitim.supabase.co` (in `.env`, gitignored)
  - Schema: [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql)
- ✅ `src/lib/supabase.js` — client singleton, `null` if env vars missing
- ✅ `src/auth/AuthProvider.jsx` — `useAuth()` exposes `{session, loading, supabaseDisabled, signIn, signUp, signOut}`
- ✅ `src/components/LoginPage.jsx` — email + password sign-in / sign-up form
- ✅ `src/main.jsx` — Gate component renders `<LoginPage>` if no session, else `<App>`
- ✅ Production env vars wired into `.github/workflows/deploy.yml` via `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` repo secrets
- ✅ Sign-out button in Settings → Account section
- ✅ Email auth provider enabled in Supabase

## What's NOT done (your job)

1. **Data layer module** — wrap Supabase queries behind the function names
   the components currently use for localStorage
2. **Replace localStorage calls** — swap all reads/writes in App.jsx, data.js,
   settings.jsx
3. **Migration tool** — one-time button to bulk-insert existing localStorage data
   into the user's cloud workspace
4. **Realtime sync** — subscribe to Postgres changes so device A sees device B's
   edits within ~1s
5. **Loading/error states** — the app currently assumes synchronous data access;
   needs spinners, error boundaries, optimistic updates
6. **Google OAuth** (deferred, optional for v1) — Step 3 from `supabase/README.md`

## Outstanding setup TODOs (block production but not local dev)

- [ ] Supabase **URL Configuration** (Authentication → URL Configuration in dashboard)
  - Site URL: `https://timihaji.github.io/task-manager-app/`
  - Redirect URLs: `https://timihaji.github.io/task-manager-app/**` and `http://localhost:5174/**`
- [ ] Google OAuth (optional — see [`supabase/README.md`](supabase/README.md))

---

## The 8 localStorage keys to migrate

Run this to see exact call sites:

```bash
grep -rn "tm_" src/data.js src/App.jsx src/components/settings.jsx
```

| Key | Maps to Supabase | Shape | Where used |
|---|---|---|---|
| `tm_tasks_v2` | `public.tasks` (one row per task) | array of task objects | `src/App.jsx` `loadTasks` / `setTasks` writes |
| `tm_settings` | `public.user_settings.settings` (jsonb) | `{look, density, font, theme, accent, ...}` | `src/App.jsx` `loadTM` / `saveTM` |
| `tm_taxonomy` | `public.taxonomy` (one row per workspace) | `{contexts, tags, lifeAreas}` | `src/App.jsx` taxonomy editor |
| `tm_filter_prefs` | bundle into `user_settings.settings.filterPrefs` | `{mode: 'and'\|'or'}` | `src/App.jsx` filter dropdown |
| `tm_group_prefs` | bundle into `user_settings.settings.groupPrefs` | `{global, inbox}` | `src/App.jsx` group dropdown |
| `tm_recent_block_reasons` | bundle into `user_settings.settings.recentBlockReasons` | `string[]` (max 8) | `src/App.jsx` block dialog |
| `tm_delegation_people_v1` | `public.people` (one row per person) | array of person objects | `src/data.js` `loadPeople` / `savePeople` |
| `tm_import_*` | drop entirely (was sunsama-import guard) | string `'done'` | one-time import marker, no longer needed |

**Recommendation**: bundle the small prefs (`tm_filter_prefs`, `tm_group_prefs`,
`tm_recent_block_reasons`) into `user_settings.settings` rather than creating
separate columns/tables. They're per-user UI state.

---

## Recommended structure for the data layer

Create `src/lib/db.js` that wraps Supabase calls behind the same shape the
components expect. Key principle: **let the components stay synchronous-looking
where possible** — load all the data once on startup, then mutate via the API.

```js
// src/lib/db.js (sketch — refine as you build)
import { supabase } from './supabase.js';

// === Workspace ===
export async function getOrCreateWorkspace(userId) {
  const { data } = await supabase.from('workspaces').select('*').eq('user_id', userId).limit(1);
  if (data?.[0]) return data[0];
  const { data: created } = await supabase.from('workspaces').insert({ user_id: userId, name: 'Personal' }).select().single();
  return created;
}

// === Tasks ===
export async function fetchTasks(workspaceId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(rowToTask);  // snake_case -> camelCase
}

export async function upsertTask(task, userId, workspaceId) {
  const row = taskToRow(task, userId, workspaceId);  // camelCase -> snake_case
  const { error } = await supabase.from('tasks').upsert(row);
  if (error) throw error;
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// === Settings ===
export async function fetchSettings(userId) { /* ... */ }
export async function saveSettings(userId, settings) { /* ... */ }

// === Taxonomy ===
export async function fetchTaxonomy(workspaceId) { /* ... */ }
export async function saveTaxonomy(workspaceId, userId, taxonomy) { /* ... */ }

// === People ===
export async function fetchPeople(workspaceId) { /* ... */ }
export async function upsertPerson(person, userId, workspaceId) { /* ... */ }

// === Realtime ===
export function subscribeTasks(workspaceId, onChange) {
  const ch = supabase
    .channel(`tasks:${workspaceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${workspaceId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(ch);
}
```

### snake_case ↔ camelCase mapping

The DB uses snake_case (Postgres convention), the JS app uses camelCase.
Build small `rowToTask` / `taskToRow` helpers in `db.js`. Don't sprinkle
mapping logic across components.

```js
const FIELD_MAP = {
  workspaceId: 'workspace_id',
  userId: 'user_id',
  cardType: 'card_type',
  parentId: 'parent_id',
  childOrder: 'child_order',
  lifeArea: 'life_area',
  timeEstimate: 'time_estimate',
  completedAt: 'completed_at',
  snoozedUntil: 'snoozed_until',
  blockedReason: 'blocked_reason',
  blockedBy: 'blocked_by',
  blockedSince: 'blocked_since',
  followUpAt: 'follow_up_at',
  delegatedTo: 'delegated_to',
  delegatedAt: 'delegated_at',
  delegationStatus: 'delegation_status',
  checkInSchedule: 'check_in_schedule',
  checkInTaskIds: 'check_in_task_ids',
  checkInOf: 'check_in_of',
  checkInDayOffset: 'check_in_day_offset',
  expiryDate: 'expiry_date',
  expiryTaskId: 'expiry_task_id',
  expiryOf: 'expiry_of',
  lastContactAt: 'last_contact_at',
  delegationHistory: 'delegation_history',
  sourceId: 'source_id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};
```

---

## How to refactor App.jsx loadTasks/setTasks

Currently:

```js
// src/App.jsx — synchronous, localStorage-backed
const [tasks, setTasks] = useState(loadTasks);

const loadTasks = () => {
  const saved = JSON.parse(localStorage.getItem('tm_tasks_v2') || 'null');
  return Array.isArray(saved) ? migrateTasks(saved) : INIT_TASKS;
};

useEffect(() => {
  localStorage.setItem('tm_tasks_v2', JSON.stringify(tasks));
}, [tasks]);
```

New (rough sketch — adapt to actual code):

```js
const { session } = useAuth();
const [tasks, setTasks] = useState([]);
const [loading, setLoading] = useState(true);
const workspaceRef = useRef(null);

// Initial load
useEffect(() => {
  if (!session) return;
  (async () => {
    const ws = await getOrCreateWorkspace(session.user.id);
    workspaceRef.current = ws;
    setTasks(await fetchTasks(ws.id));
    setLoading(false);
  })();
}, [session]);

// Persist on change — debounce to avoid hammering the API
const taskRef = useRef(tasks);
useEffect(() => {
  const prev = taskRef.current;
  taskRef.current = tasks;
  // diff prev vs tasks; upsert/delete the changes
  syncDiff(prev, tasks, session.user.id, workspaceRef.current.id);
}, [tasks]);

// Realtime subscription
useEffect(() => {
  if (!workspaceRef.current) return;
  const unsub = subscribeTasks(workspaceRef.current.id, (payload) => {
    // Apply remote change to local state if not already there
    setTasks(prev => applyRealtimeChange(prev, payload));
  });
  return unsub;
}, [workspaceRef.current?.id]);
```

**Key hazards:**
1. **Don't write the whole task array on every keystroke** — `localStorage.setItem`
   was cheap, `INSERT/UPDATE` on every change is not. Diff and only persist
   what changed, with a debounce (500ms is fine).
2. **Avoid round-trips** — when realtime fires and the change is from THIS
   client, ignore it (compare row's `updated_at` to your local timestamp, or
   tag mutations with a client-id).
3. **Order matters** — when the server returns rows ordered by `created_at`,
   that's not the same as the user's ordering. Tasks have `child_order` (for
   projects) and a `position` field is missing — you may need to add one in a
   future migration if ordering becomes important.

---

## Migration tool

Existing users (including Tim) have data in localStorage that needs to come
across. Build a one-time UI:

```jsx
// src/components/MigrateFromLocal.jsx
function MigrateFromLocal({ onComplete }) {
  const { session } = useAuth();
  const [running, setRunning] = useState(false);
  const localTasks = JSON.parse(localStorage.getItem('tm_tasks_v2') || '[]');

  if (!localTasks.length) return null;

  return (
    <div className="migrate-banner">
      <p>Found {localTasks.length} tasks in this browser. Import them into your account?</p>
      <button onClick={async () => {
        setRunning(true);
        const ws = await getOrCreateWorkspace(session.user.id);
        // chunk into batches of 100 to avoid request size limits
        for (const chunk of chunked(localTasks, 100)) {
          await supabase.from('tasks').insert(
            chunk.map(t => taskToRow(t, session.user.id, ws.id))
          );
        }
        // also migrate settings, taxonomy, people
        // mark as done so we don't show this again
        localStorage.setItem('tm_migrated_to_cloud', 'true');
        onComplete();
      }}>Import</button>
      <button onClick={() => { localStorage.setItem('tm_migrated_to_cloud', 'skipped'); onComplete(); }}>
        Skip — start fresh
      </button>
    </div>
  );
}
```

Show this banner when `session && !localStorage.getItem('tm_migrated_to_cloud') && localTasks.length > 0`.

**Edge case**: tasks have client-generated string IDs (`t501`, `dl1`, etc.).
The schema uses `text primary key`, not UUID, specifically so existing IDs
import unchanged. Don't try to remap.

**Edge case 2**: parent/child references (`parentId`, `blockedBy`, `checkInTaskIds`)
are arrays of those text IDs. They need to insert in dependency order, OR
you defer constraint checks. Easiest: temporarily drop the `parent_id` foreign
key constraint, insert all rows, re-add the constraint. OR insert in two passes
(parents first, children second).

---

## Recommended PR breakdown

Don't try to land all of this in one PR. Suggested order:

1. **PR A — Data layer skeleton + workspace bootstrap**
   - `src/lib/db.js` with all the function shells
   - On sign-in, fetch-or-create the user's workspace
   - Display "loading..." state in App while fetching
   - Don't replace any localStorage calls yet — just verify the connection
     and rendering works in a loading state

2. **PR B — Tasks migration**
   - Replace `tm_tasks_v2` reads/writes with `db.fetchTasks` / `db.upsertTask` / `db.deleteTask`
   - Implement diff-based persistence (don't write the whole array on every change)
   - Verify creating, editing, completing, deleting tasks all persist

3. **PR C — Settings + taxonomy + people migration**
   - The remaining 7 localStorage keys
   - Bundle small prefs into `user_settings.settings` jsonb

4. **PR D — Realtime sync**
   - Subscribe to `postgres_changes` on `tasks`, `taxonomy`, `people`
   - Handle remote inserts/updates/deletes
   - De-dupe local mutations to avoid loops

5. **PR E — Migration tool**
   - `MigrateFromLocal` component
   - Show on sign-in if local data exists
   - Bulk-import in batches with progress indicator

6. **PR F — Polish**
   - Error states (network failure, RLS denial)
   - Loading skeletons
   - Optimistic updates (apply locally first, roll back on server error)

Each PR should be independently mergeable. After each merge, the deployed app
should remain functional (even if degraded for users with no migration done yet).

---

## Schema cheat sheet

Full SQL: [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql)

```
workspaces      (id uuid pk, user_id, name, created_at)
tasks           (id text pk, workspace_id, user_id, title, ..., card_type, parent_id, ...)
people          (id uuid pk, workspace_id, user_id, name, preferred_cadence, ...)
user_settings   (user_id pk, settings jsonb)
taxonomy        (workspace_id pk, user_id, contexts jsonb, tags jsonb, life_areas jsonb)
```

Every table has Row-Level Security with `auth.uid() = user_id`. **Don't disable
it.** Without RLS, any authenticated user can read everyone's data.

A trigger on `auth.users` auto-creates a "Personal" workspace on signup, so
new users always have at least one workspace.

---

## Files you'll touch most

- [`src/lib/db.js`](src/lib/db.js) — **create**, all data access lives here
- [`src/App.jsx`](src/App.jsx) — replace 15 localStorage calls
- [`src/data.js`](src/data.js) — replace 2 localStorage calls (people store)
- [`src/components/settings.jsx`](src/components/settings.jsx) — replace 2 localStorage calls (taxonomy)
- [`src/components/MigrateFromLocal.jsx`](src/components/MigrateFromLocal.jsx) — **create**

## Files you can probably leave alone

- All `src/components/*.jsx` other than settings.jsx — they receive tasks via props
- `src/utils/*` — pure helpers, no I/O
- `src/auth/AuthProvider.jsx` — already done

---

## Estimated scope

- **PR A** (skeleton + workspace bootstrap): ~1h
- **PR B** (tasks): ~2-3h, the big one
- **PR C** (settings/taxonomy/people): ~1-2h
- **PR D** (realtime): ~1-2h
- **PR E** (migration tool): ~1-2h
- **PR F** (polish): ~1-2h

Total: ~7-12h spread across 4-6 sessions.

---

## When in doubt

1. **Schema is the source of truth** — read [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) before assuming table shape
2. **The existing demo dataset in `INIT_TASKS`** ([src/data.js](src/data.js)) shows the canonical task shape — every field there exists in the DB schema
3. **RLS will tell you if you mess up** — if `INSERT` returns `403` or "new row violates RLS policy", you forgot to set `user_id` on the row
4. **Test with Tim's actual account** — create a test task in the running app, then run `select * from tasks` in the Supabase SQL Editor to confirm it persisted
5. **Don't trust this doc blindly** — verify with `git log` and file inspection before assuming any of this is still current
