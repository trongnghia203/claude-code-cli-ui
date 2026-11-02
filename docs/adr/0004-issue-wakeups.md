# ADR 0004: Timed wakeups per issue

- Status: Accepted
- Date: 2026-11-02

## Context

ADR 0002 added one wakeup rule: when every sub-issue is closed, the parent's agent runs again.
That rule is event driven. Some work needs a nudge at a time instead: check a ticket tomorrow morning, follow up in a week.
Multica has this on each issue: a list of wakeups, each with a time, an agent, a repeat setting and an on/off switch, plus a history.

## Decision

Each issue has its own list of timed wakeups, next to the existing sub-issue rule.

### Model

A wakeup is `{id, at, agent, instruction, repeat, enabled}`, stored on the issue under `wakeups.items`.

- `at`: when to run. A new or moved time cannot be in the past (one minute of slack).
- `agent`: an agent slug, or empty to use the issue's assignee at firing time.
- `instruction`: text added to the run prompt. Empty uses a short built-in text: check the issue, continue, summarize.
- `repeat`: once, hourly, daily, weekdays or weekly. A repeating wakeup keeps its time of day (hourly: its minute) and moves `at` to the next occurrence.
  After a long stop, hourly jumps to the next whole hour in the future in one step. It does not fire once per missed hour.
- `enabled`: the switch. A wakeup that fired once is switched off and stays in the list. To use it again, pick a new time.
- Up to 20 per issue.

Every firing, or skip, is written to `wakeupHistory` on the issue: time, `started` or `skipped`, and a note. The last 50 are kept.

### Scheduler

A server plugin checks every 30 seconds, plus once 5 seconds after start. It runs the issue's agent through the normal run path,
with the trigger "Wakeup" and the instruction in the prompt.

- It only runs while the app server runs, like every issue run (ADR 0001). A wakeup missed while the app was off fires on the next start,
  and the history says it was late. A repeating one then moves to its next future time, so it never fires several times to catch up.
- If a run is already active on the issue, the wakeup waits and is tried again on the next check. Nothing is lost and runs never overlap.
- A closed issue (done or cancelled) skips the wakeup and says so in the history.
- No agent (no assignee and none chosen) skips it with a note.
- An agent chosen for the wakeup runs for that wakeup only. The assignee does not change.

Schedules use launchd so they run with the app closed. We did not do that here: wakeups act on one issue and need the issue store,
the approval flow and the live run state, which only the app server has.

### Interface

- Issue sidebar: a Wakeups section with a count, a + button, and one row per wakeup (time, agent, repeat, switch).
  A row opens the edit dialog, which also deletes. A collapsible Wakeup history sits under the rows.
- The board card can show the next wakeup time. It is a card property, on by default.
- The page checks again every 30 seconds while a wakeup is set, so a firing shows without a reload.
- The sub-issue rule row stays in the same section.

### API

- `POST /api/issues/:id/wakeups`, `PUT` and `DELETE /api/issues/:id/wakeups/:wid`.
- The issue `PUT` edits only the sub-issue override. It no longer replaces `wakeups`, so saving it never drops timed wakeups.

## Consequences

- Wakeups do nothing while the app is closed, and fire late after it opens. The history shows this.
- Times are stored in UTC and shown in local time. Daily and weekly repeats keep the local time of day across daylight saving.
- A wakeup waiting on a long run can fire after the run ends, not at its set time. The history shows the real time.
- No inbox: a wakeup on an issue with no agent is only skipped, with a note in the history.
