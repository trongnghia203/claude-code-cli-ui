import fs from 'node:fs'
import { resolveClaudePath } from '../../utils/claudeDir'

interface LogEntry {
  timestamp: number
  line: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'unknown'
  component: string
}

interface SourceState {
  buffer: LogEntry[]
  filePosition: number
  subscribers: Set<(s: string) => void>
}

const LOG_BUFFER_SIZE = 200
const POLL_INTERVAL_MS = 1000
const INITIAL_READ_BYTES = 15_000
const KEEPALIVE_INTERVAL_MS = 20_000

const SOURCE_PATHS: Record<string, string> = {
  daemon: resolveClaudePath('daemon.log'),
  ui: '/tmp/claude-code-agents-ui.log',
}

const states = new Map<string, SourceState>()

function parseLine(raw: string): LogEntry {
  const m = raw.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/)
  if (m) {
    const msg = m[3].toLowerCase()
    const level = msg.includes('error') ? 'ERROR'
      : msg.includes('warn') ? 'WARN'
      : msg.includes('debug') ? 'DEBUG'
      : 'INFO'
    return { timestamp: new Date(m[1]).getTime() || Date.now(), line: raw, level, component: m[2] }
  }
  return { timestamp: Date.now(), line: raw, level: 'unknown', component: 'unknown' }
}

function getOrInitSource(logPath: string): SourceState {
  if (states.has(logPath)) return states.get(logPath)!

  const state: SourceState = { buffer: [], filePosition: 0, subscribers: new Set() }
  states.set(logPath, state)

  // Seed from tail
  try {
    const stat = fs.statSync(logPath)
    const start = Math.max(0, stat.size - INITIAL_READ_BYTES)
    state.filePosition = stat.size
    const buf = Buffer.alloc(stat.size - start)
    const fd = fs.openSync(logPath, 'r')
    fs.readSync(fd, buf, 0, buf.length, start)
    fs.closeSync(fd)
    for (const l of buf.toString('utf8').split('\n').filter(l => l.trim())) {
      if (state.buffer.length >= LOG_BUFFER_SIZE) state.buffer.shift()
      state.buffer.push(parseLine(l))
    }
  } catch { /* file may not exist */ }

  setInterval(() => {
    try {
      const stat = fs.statSync(logPath)
      if (stat.size <= state.filePosition) return
      const buf = Buffer.alloc(stat.size - state.filePosition)
      const fd = fs.openSync(logPath, 'r')
      fs.readSync(fd, buf, 0, buf.length, state.filePosition)
      fs.closeSync(fd)
      state.filePosition = stat.size
      for (const l of buf.toString('utf8').split('\n').filter(l => l.trim())) {
        const entry = parseLine(l)
        if (state.buffer.length >= LOG_BUFFER_SIZE) state.buffer.shift()
        state.buffer.push(entry)
        const payload = `data: ${JSON.stringify(entry)}\n\n`
        for (const send of state.subscribers) send(payload)
      }
    } catch { /* file gone or unreadable */ }
  }, POLL_INTERVAL_MS)

  return state
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const sourceId = (query.source as string) || 'daemon'
  const logPath = SOURCE_PATHS[sourceId] ?? SOURCE_PATHS.daemon!

  const state = getOrInitSource(logPath)

  setHeader(event, 'Content-Type', 'text/event-stream')
  setHeader(event, 'Cache-Control', 'no-cache')
  setHeader(event, 'Connection', 'keep-alive')
  setHeader(event, 'X-Accel-Buffering', 'no')

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const send = (s: string) => {
    try { writer.write(encoder.encode(s)) } catch { /* client gone */ }
  }

  for (const entry of state.buffer) {
    send(`data: ${JSON.stringify(entry)}\n\n`)
  }

  state.subscribers.add(send)

  const keepalive = setInterval(() => send(': keepalive\n\n'), KEEPALIVE_INTERVAL_MS)

  event.node.req.on('close', () => {
    clearInterval(keepalive)
    state.subscribers.delete(send)
    writer.close().catch(() => {})
  })

  return sendStream(event, readable)
})
