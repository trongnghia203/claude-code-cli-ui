const ITERM_RESULT_TITLE = {
  'focused': 'Switched to open iTerm2 session',
  'opened-tab': 'Opened in new iTerm2 tab',
  'opened-window': 'Opened in new iTerm2 window',
} as const

const POLL_MS = 10_000

// Open sessions in iTerm2 and track which sessions already have a terminal attached
export function useItermSessions() {
  const toast = useToast()
  const attachedIds = useState<string[]>('iterm-attached-ids', () => [])

  async function refresh() {
    try {
      const { sessionIds } = await $fetch<{ sessionIds: string[] }>('/api/sessions/terminal-status')
      attachedIds.value = sessionIds
    } catch {
      // keep last known state
    }
  }

  function isAttached(sessionId: string) {
    return attachedIds.value.includes(sessionId.toLowerCase())
  }

  async function launch(sessionId: string, cwd?: string | null, projectPath?: string | null) {
    try {
      const { result } = await $fetch<{ result: keyof typeof ITERM_RESULT_TITLE }>(
        `/api/sessions/${encodeURIComponent(sessionId)}/launch-terminal`,
        { method: 'POST', body: { cwd, projectPath } },
      )
      toast.add({ title: ITERM_RESULT_TITLE[result] ?? 'Opened in iTerm2', color: 'success' })
      // process shows up in ps shortly after the tab starts
      setTimeout(refresh, 2000)
    } catch (e: any) {
      toast.add({ title: 'Failed to open iTerm2', description: e?.data?.message || e?.message, color: 'error' })
    }
  }

  // Poll while the calling component is mounted
  function startPolling() {
    let timer: ReturnType<typeof setInterval> | undefined
    onMounted(() => {
      refresh()
      timer = setInterval(refresh, POLL_MS)
    })
    onBeforeUnmount(() => clearInterval(timer))
  }

  return { attachedIds, isAttached, launch, refresh, startPolling }
}
