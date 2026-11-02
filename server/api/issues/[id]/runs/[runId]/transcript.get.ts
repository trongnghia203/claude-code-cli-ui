import { readTranscript } from '../../../../../utils/issues/store'

export interface TranscriptItem {
  kind: 'prompt' | 'text' | 'tool' | 'tool_result' | 'result'
  text?: string
  id?: string
  name?: string
  input?: unknown
  isError?: boolean
}

const asText = (c: any): string =>
  typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => (typeof x === 'string' ? x : x?.text ?? '')).join('\n') : ''

/** Flatten the saved stream-json lines into a simple list the page can render. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const runId = getRouterParam(event, 'runId')!
  const items: TranscriptItem[] = []
  for (const m of readTranscript(id, runId) as any[]) {
    if (m.type === 'prompt') items.push({ kind: 'prompt', text: m.text })
    else if (m.type === 'assistant') {
      for (const b of m.message?.content ?? []) {
        if (b.type === 'text' && b.text?.trim()) items.push({ kind: 'text', text: b.text })
        else if (b.type === 'tool_use') items.push({ kind: 'tool', id: b.id, name: b.name, input: b.input })
      }
    } else if (m.type === 'user' && Array.isArray(m.message?.content)) {
      for (const b of m.message.content) if (b.type === 'tool_result') items.push({ kind: 'tool_result', id: b.tool_use_id, text: asText(b.content), isError: !!b.is_error })
    } else if (m.type === 'result') items.push({ kind: 'result', text: String(m.result ?? ''), isError: !!m.is_error })
  }
  return { items }
})
