// JXA — mark reminders completed by id (the "archive" step).
//
// Run via: osascript -l JavaScript complete-reminders.js <id> [<id> ...]
// Completing a reminder drops it out of the active list so it is never
// re-pulled. Prints the number successfully completed to stdout.

function run(argv) {
  if (!argv || !argv.length) return '0';
  const Reminders = Application('Reminders');
  let done = 0;
  for (let i = 0; i < argv.length; i++) {
    try {
      const r = Reminders.reminders.byId(argv[i]);
      r.completed = true;
      done++;
    } catch (e) {
      // Skip ids that no longer resolve (deleted/already completed elsewhere).
    }
  }
  return String(done);
}
