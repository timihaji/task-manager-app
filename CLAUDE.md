# Task Manager App — Claude collaboration notes

## Dev auth bypass

The app sits behind a Supabase login. **For interactive verification, navigate to `http://localhost:5174/?dev=1`** — that flips `supabase` to `null`, which short-circuits the auth gate, the workspace fetch, and every cloud read/write. The app boots straight into a populated state seeded from `INIT_TASKS` (see [src/data.js](src/data.js)) so Stack, Board, Inbox, and Timeline are all reachable without credentials.

The bypass also accepts `localStorage.tm_dev = '1'` if the URL param is inconvenient. Production builds still require the user to opt in via URL/localStorage, so this doesn't weaken auth for real users.

**Use it.** "Verified in synthetic DOM" is not the same as "verified by interaction" — test the actual flow in the preview, especially for drag-and-drop, keyboard, focus, or anything stateful. CSS-only verification has cost full sessions when interactive bugs slipped through.

## HTML5 drag-and-drop quirks (StackView)

Two reproducible Chromium bugs that bit hard during the Stack drag refactor — reason about both before changing drag code in [src/components/StackView.jsx](src/components/StackView.jsx):

1. **Source mutation right after `dragstart` aborts the drag.** Setting `display:none`, `max-height:0`, `pointer-events:none`, or removing the source synchronously after dragstart (including via the React commit that follows the handler) makes Chromium cancel the drag — symptom: drag never registers. If the source must visibly disappear, defer ≥80ms via setTimeout/useEffect.

2. **Moving an element under the cursor causes a flicker loop.** The current Trello-style approach uses `displaySorted` to slide the source to the hover position. That puts the source under the cursor → `dragover` fires on the source → if the handler reacts with "cursor over source → clear hover state", the source slides back → cursor over the original target → state resets → source slides back under cursor → flicker at ~60Hz. The handlers in [StackView.jsx](src/components/StackView.jsx) explicitly `return` early on `dragover`-on-source for this reason; preserve that behaviour.

3. **Drop fires on the source.** Because `displaySorted` placed the source under the cursor, `targetId === draggedId` at drop time. `handleDrop` uses `drag.overId` / `drag.overPos` (the last hover state) as the anchor, NOT the literal `targetId`. Don't add a "no-op if dragging onto self" guard at the top of the handler — it'll reject every Trello-style drop.

## Architecture pointers

- **Stack drag flow:** `displaySorted` (visual order during drag) → `useLayoutEffect` auto-FLIP captures positions and slides moved cards on every render → drop commits via `setTweak('stackOrder', ...)`. There's no separate preview component; the dimmed source IS the placeholder.
- **Auth + data layer:** `AuthProvider` → `WorkspaceProvider` → `App`. All three respect `supabaseDisabled` (which is `true` in dev-bypass mode). Cloud writes are guarded behind `if (!workspaceId || !userId) return`.
- **Phase 2 migration context:** see [HANDOFF.md](HANDOFF.md) for the localStorage → Supabase migration history. Most of it is done; realtime sync and migration-tool polish are the remaining gaps.

## Style notes

- Python 3.9 syntax for any backend scripts (no `list[str]`, use `from typing import List`).
- Windows cp1252 console — avoid emoji/box-drawing in printed output unless asked.
- Match the surrounding code style in JSX (terse, comments only when the *why* is non-obvious).
