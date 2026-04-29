# Task Manager

A task manager built around delegation and check-in tracking — for people who hand off work and need to make sure it doesn't fall through the cracks.

## Live demo

**[https://timihaji.github.io/task-manager-app/](https://timihaji.github.io/task-manager-app/)**

Your data lives in your own browser (localStorage), so the demo is fully private to you. Nothing is sent anywhere.

## Features

- Tasks with projects, tags, priorities, time estimates
- Recurring tasks (daily, weekdays, weekly, monthly with intervals)
- Subtasks and task blocking with reasons
- **Delegation** with check-in schedules, staleness detection, and a people memory store
- Calendar/week view with drag-drop between dates
- 12 color themes, dark/light mode, density and look presets
- Inbox capture, snooze, archive
- JSON import/export

## Status

Work in progress. The current build is a single-HTML React prototype intended for demos and dogfooding. A full SaaS version (cloud sync, accounts, mobile PWA) is in development.

## Running locally

No build step required:

```bash
npx http-server . -p 5174
```

Then open `http://localhost:5174`.
