# Orbit — personal command center

One app for your calendar, tasks, notes, journal, money and planning.
Local-first: everything is stored on your device (IndexedDB), works offline,
and installs to your phone's home screen like a native app.

**Live app:** https://den1sssss.github.io/orbit/

## Install on iPhone

1. Open **https://den1sssss.github.io/orbit/** in **Safari** on the iPhone.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Open Orbit from the new icon — full-screen, works offline, data stays on the phone.

Install *before* entering data: Safari and the Home Screen app keep separate storage on iOS.
To enable reminders, open the installed app → Settings → **Enable notifications** (iOS 16.4+).
To move data between devices, use Settings → Data → **Download backup** / **Import backup**.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173 (also prints a LAN address)
npm test           # core logic tests (recurrence, budgets, payments, encryption, briefing)
npm run build      # type-check + production build into dist/
```

## Deploy an update

```bash
npm run deploy     # builds and publishes dist/ to the gh-pages branch → GitHub Pages
```

The installed app picks up the new version the next time it's opened. Your data is not touched —
only the app code is published; personal data never leaves the device.

## What's inside (phase 1)

| Area | Highlights |
|---|---|
| **Home** | Daily briefing (smart insights), quick add, today's schedule, tasks, month money, budget, upcoming payments, goals, mood check-in. Widgets can be hidden/reordered. |
| **Calendar** | Month / week / day / agenda views, recurring events (daily/weekly/monthly/yearly, custom weekdays, end date, skip one occurrence), reminders, event types & colors. Tasks, bill due dates, notes and journal entries show on their dates. |
| **Tasks** | Today / upcoming / all / board / done views, categories, priorities, statuses, deadlines + time, reminders, checklists, tags, projects, quick-add syntax (`tomorrow !high #work @Acme`). |
| **Notes** | Work, business, personal, ideas, daily and important-info sections; pinning, archive, checklists (shopping lists), attach to a date or project. |
| **Journal** | One entry per day with autosave: mood & energy, daily prompt, gratitude ×3, wins, lessons, tomorrow's focus, tags. Mood trend, mood calendar, streaks, search, "on this day", and a summary of your day pulled from calendar/tasks/money. |
| **Money** | Income & expense tracking (amount, date, category, payment method, payee, notes, personal vs business), monthly summaries, charts, filters, CSV export. |
| **Planner** | Monthly budgets per category with planned-vs-actual, safe-to-spend per day, savings target, savings goals with contributions, planned payments & subscriptions with "mark paid" (logs the expense and rolls the due date). |
| **Search** | ⌘K / Ctrl K — searches tasks, notes, events, journal and transactions. |
| **Settings** | Name, currency, week start, theme, money categories & payment methods, notifications, passcode, backups. |

### Privacy, saving and backup

- **Autosave** on every change, plus an automatic **daily snapshot** (last 7 days kept, restorable in Settings → Data).
- **Passcode lock** (Settings → Security): encrypts all data at rest with AES-256-GCM using a key derived from your passcode (PBKDF2-SHA-256, 310k iterations). Auto-locks after time in the background. There is no recovery without the passcode — keep an exported backup.
- **Export / import** a `.json` backup (optionally encrypted) — also how you move data between devices.
- No accounts, no servers, no tracking.

### Smart assistant

The daily briefing is computed locally from your data: overdue tasks and payments, the next event,
your biggest free block today (and which task to put in it), packed-day warnings, deadlines in the next
3 days, budget overruns, spending pace vs. the month, savings target progress, goal pace, journaling streak and mood dips.

## Project structure

```
src/
  lib/                data model (types.ts), store, persistence + encryption, dates/recurrence,
                      finance math, agenda joins, insights (briefing), reminders, demo data
  components/ui       design-system primitives (Button, Card, Sheet, Segmented, Progress, …)
  components/editors  shared editors for tasks, events, transactions, notes
  components/layout   app shell (sidebar / bottom tabs), quick add, lock screen, onboarding
  pages/              Dashboard, Calendar, Tasks, Notes, Journal, money/*, Search, Settings
```

Stack: React 18, TypeScript, Vite 6, Tailwind CSS 4, zustand, date-fns, Recharts, vite-plugin-pwa.

## Next phases

Business & work manager (clients, projects, invoices, profit), goals & habit tracker,
daily-life organizer (shopping lists, documents vault, important dates), reports & insights pages,
and an optional AI assistant.
