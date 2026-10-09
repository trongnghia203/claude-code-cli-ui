#!/usr/bin/env node
// Runs one scheduled job. Started by launchd (see server/utils/schedules/launchd.ts) and by "Run now".
// Usage: node run-schedule.mjs <jobId> [--manual] [--run-id <id>]
import { runJob } from './schedule-core.mjs'

const [jobId, ...rest] = process.argv.slice(2)
if (!jobId) {
  console.error('usage: run-schedule.mjs <jobId> [--manual] [--run-id <id>]')
  process.exit(2)
}
const idx = rest.indexOf('--run-id')
await runJob(jobId, {
  trigger: rest.includes('--manual') ? 'manual' : 'schedule',
  ...(idx >= 0 && rest[idx + 1] ? { runId: rest[idx + 1] } : {}),
})
