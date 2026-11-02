/** "Today 08:39 PM", "Tomorrow 09:00 AM", "Mon 3 Nov 09:00 AM", with the year when it is not this one */
export function formatWakeAt(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((day - today) / 86_400_000)
  if (diff === 0) return `Today ${time}`
  if (diff === 1) return `Tomorrow ${time}`
  if (diff === -1) return `Yesterday ${time}`
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
  return `${date} ${time}`
}
