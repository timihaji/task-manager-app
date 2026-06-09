# Apple Reminders → Task Manager pull-and-archive helper

A small **macOS-only** helper that pulls your incomplete Apple Reminders into
Task Manager (Supabase) and then marks them completed in Reminders so they
drop out of your active list. One-way: Reminders → Task Manager.

The web app itself can't touch Apple Reminders — a browser has no access to
Apple's `EventKit` / AppleScript. So the pull runs here, on your Mac, and the
imported tasks show up in the app automatically via the existing Supabase
realtime sync. No web-app changes are involved.

## How it works

1. `jxa/read-reminders.js` reads incomplete reminders via JavaScript for
   Automation (JXA) and prints them as JSON.
2. `sync.mjs` signs in to Supabase **as you** (so writes respect row-level
   security), de-dupes against anything already imported, and upserts the new
   reminders into the `tasks` table tagged `source = 'apple-reminders'` with
   the reminder's stable UUID as `source_id`.
3. `jxa/complete-reminders.js` marks each imported reminder **completed** in
   Apple Reminders — the "archive" step. Because completed reminders are no
   longer read in step 1, re-runs never create duplicates.

## Field mapping

| Apple Reminder        | Task Manager field                              |
|-----------------------|-------------------------------------------------|
| name                  | `title`                                         |
| notes / body          | `description`                                   |
| due date              | `date` (scheduled day; **no due date → Inbox**) |
| priority high/med/low | `priority` p1 / p2 / p3 (none → p3)             |
| list name             | recorded in the activity log entry              |
| —                     | `project` defaults to `LIFE` (see `--project`)  |

`project`/`tags` aren't inferred from Reminders (the app's contexts and tags
are a fixed taxonomy). Everything lands under one context; re-file in the app.

## Setup

The helper reuses the web app's `.env` for the Supabase connection and adds
your login. From the repo root, add to `.env`:

```
# already present for the web app:
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>

# add for this helper:
TM_EMAIL=you@example.com
TM_PASSWORD=your-task-manager-password
# optional:
TM_PROJECT=LIFE                       # default context for imports
REMINDERS_LISTS=Inbox,Work            # default lists (omit = all lists)
```

`@supabase/supabase-js` is already a dependency of the app, so no extra
`npm install` is needed — just run the script from the repo root.

## Usage

```bash
# Preview what would be imported (no writes, no completes):
node scripts/apple-reminders-sync/sync.mjs --dry-run

# Pull everything and archive the reminders:
node scripts/apple-reminders-sync/sync.mjs

# Only specific lists, filed under WORK:
node scripts/apple-reminders-sync/sync.mjs --list "Work" --list "Errands" --project WORK

# Import but leave the reminders active in Apple Reminders:
node scripts/apple-reminders-sync/sync.mjs --no-complete
```

### First run: Automation permission

The first time it runs, macOS prompts to let your terminal (or `node`) control
**Reminders.app**. Approve it (also check
*System Settings → Privacy & Security → Automation*). Without it, step 1 fails
with a permission error.

### Run it on a schedule (optional)

Use `launchd` to pull, say, every 30 minutes. Create
`~/Library/LaunchAgents/com.taskmanager.reminders-sync.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.taskmanager.reminders-sync</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/ABSOLUTE/PATH/TO/task-manager-app/scripts/apple-reminders-sync/sync.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>/ABSOLUTE/PATH/TO/task-manager-app</string>
  <key>StartInterval</key><integer>1800</integer>
  <key>StandardErrorPath</key><string>/tmp/tm-reminders-sync.log</string>
  <key>StandardOutPath</key><string>/tmp/tm-reminders-sync.log</string>
</dict></plist>
```

Then `launchctl load ~/Library/LaunchAgents/com.taskmanager.reminders-sync.plist`.
(Adjust the `node` path — `which node`.)

## Safety notes

- **Idempotent.** Re-running is safe: already-imported reminders are skipped by
  `source_id`, and if a run imports but dies before completing, the next run
  finishes the archive step.
- **One-way only.** It never deletes Task Manager tasks and never edits
  reminders other than marking pulled ones completed.
- Use `--dry-run` first to confirm the mapping looks right for your lists.
