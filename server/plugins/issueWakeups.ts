import { fireDueWakeups } from '../utils/issues/wakeups'

const TICK_MS = 30_000

/** Timed issue wakeups fire only while the app server runs. After a restart, missed ones fire at once and are marked late. */
export default defineNitroPlugin(() => {
  const g = globalThis as { __issueWakeupTimer?: ReturnType<typeof setInterval> }
  if (g.__issueWakeupTimer) clearInterval(g.__issueWakeupTimer) // dev reloads would otherwise stack timers
  const tick = () => { try { fireDueWakeups() } catch (e) { console.error('[issue wakeups]', e) } }
  g.__issueWakeupTimer = setInterval(tick, TICK_MS)
  g.__issueWakeupTimer.unref?.()
  setTimeout(tick, 5_000)
})
