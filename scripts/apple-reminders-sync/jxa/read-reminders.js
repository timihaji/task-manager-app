// JXA (JavaScript for Automation) — read incomplete reminders as JSON.
//
// Run via: osascript -l JavaScript read-reminders.js [listName ...]
// With no args it reads every list; with args it reads only the named lists.
// Prints a JSON array to stdout. Requires Automation permission for the host
// process (Terminal/node) to control Reminders.app (granted on first run).

function run(argv) {
  const Reminders = Application('Reminders');
  const wantLists = (argv && argv.length) ? argv : null;
  const out = [];

  const lists = Reminders.lists();
  for (let i = 0; i < lists.length; i++) {
    const list = lists[i];
    const listName = list.name();
    if (wantLists && wantLists.indexOf(listName) === -1) continue;

    // Pull only not-yet-completed reminders — the helper completes them after
    // import, so a re-run never re-sees what it already pulled.
    const items = list.reminders.whose({ completed: false })();
    for (let j = 0; j < items.length; j++) {
      const r = items[j];
      // Timed reminders carry `dueDate`; all-day reminders carry only
      // `alldayDueDate`. Check both so all-day items still get a scheduled day
      // instead of falling through to the Inbox.
      let dueIso = null;
      try {
        const due = r.dueDate();
        if (due) dueIso = due.toISOString();
      } catch (e) {}
      if (!dueIso) {
        try {
          const allday = r.alldayDueDate();
          if (allday) dueIso = allday.toISOString();
        } catch (e) {}
      }
      let body = '';
      try { body = r.body() || ''; } catch (e) {}
      let priority = 0;
      try { priority = r.priority(); } catch (e) {}

      out.push({
        id: r.id(),            // stable "x-apple-reminder://UUID" — our source_id
        name: r.name() || '',
        body: body,
        priority: priority,    // 0 none, 1 high, 5 medium, 9 low
        dueDate: dueIso,
        list: listName,
      });
    }
  }
  return JSON.stringify(out);
}
