#!/usr/bin/env node
// claude-ui issue ... : the agent-safe way to read and write claude-ui issues.
// Talks to the local server API. No delete, run, cancel or assign verbs on purpose:
// a watcher agent must never start a run or hand work to another agent.
import { readFileSync } from 'node:fs'

const BASE = process.env.CLAUDE_UI_URL || `http://localhost:${process.env.CLAUDE_UI_PORT || 3030}`
const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled']
const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent']
// With an assignee these two statuses start a real agent run
const RUNNING = ['todo', 'in_progress']

const USAGE = `claude-ui issue <command>

  list    [--status S] [--label L] [--limit N] [--json]
  get     KEY [--comments N] [--live] [--json]   (--live: only comments no distill or clear folded)
  create  --title T [--body TEXT | --body-file FILE|-] [--status S] [--priority P] [--label a,b] [--prop NAME=VALUE]... [--project DIR] [--parent KEY]
  update  KEY [--title T] [--body TEXT | --body-file FILE|-] [--priority P] [--label a,b] [--add-label L] [--remove-label L] [--prop NAME=VALUE]...
  property KEY set NAME=VALUE...   |  unset NAME...  |  (none: show)     custom properties, other values kept
  label    KEY add L...  |  remove L...  |  set a,b  |  (none: show)       set replaces the whole list
  move    KEY STATUS            (close = move KEY done)
  comment KEY [--body TEXT | --body-file FILE|-]
  fold    KEY [--ids a,b] [--note T] [--body TEXT | --body-file FILE|-] [--if-hash H]
          (folds live comments like /distill, without a run. --body also replaces the description)

--prop sets a custom property by name or id, repeatable: --prop "Due date=2026-11-16". Empty value clears it (--prop "Due date=").
  Select properties take the option name. Dates are YYYY-MM-DD. Other properties are kept.
Statuses: ${STATUSES.join(', ')}
Priorities: ${PRIORITIES.join(', ')}
Never assigns agents and never starts runs. --body-file - reads stdin.`

const die = (msg, code = 1) => { console.error(`error: ${msg}`); process.exit(code) }

function parse(argv) {
  const pos = []
  const opt = {}
  const multi = new Set(['add-label', 'remove-label', 'prop'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) { pos.push(a); continue }
    const k = a.slice(2)
    if (k === 'json' || k === 'live') { opt[k] = true; continue }
    const v = argv[++i]
    if (v === undefined) die(`--${k} needs a value`, 2)
    if (multi.has(k)) (opt[k] ??= []).push(v)
    else opt[k] = v
  }
  return { pos, opt }
}

async function api(path, init = {}) {
  let res
  try {
    res = await fetch(BASE + path, { ...init, headers: { 'content-type': 'application/json' } })
  } catch {
    die(`claude-ui server not reachable at ${BASE}. Start it with: claude-ui start --no-open`)
  }
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { message: text.slice(0, 200) } }
  if (!res.ok) die(data.message || data.statusMessage || `HTTP ${res.status}`)
  return data
}

function body(opt) {
  if (opt.body !== undefined && opt['body-file'] !== undefined) die('use --body or --body-file, not both', 2)
  if (opt.body !== undefined) return opt.body
  if (opt['body-file'] === undefined) return undefined
  try { return readFileSync(opt['body-file'] === '-' ? 0 : opt['body-file'], 'utf8') } catch (e) { die(`cannot read body: ${e.message}`) }
}

const csv = s => String(s).split(',').map(x => x.trim()).filter(Boolean)
const needKey = (k) => { if (!/^ISS-\d+$/.test(k || '')) die('KEY must look like ISS-12', 2); return k }
const checkStatus = (s) => { if (!STATUSES.includes(s)) die(`invalid status "${s}". Use: ${STATUSES.join(', ')}`, 2); return s }
const checkPriority = (p) => { if (!PRIORITIES.includes(p)) die(`invalid priority "${p}". Use: ${PRIORITIES.join(', ')}`, 2); return p }
const line = i => `${i.id} [${i.status}] ${i.priority !== 'none' ? i.priority + ' ' : ''}${i.title}${i.labels?.length ? `  {${i.labels.join(', ')}}` : ''}${i.assignee ? `  @${i.assignee}` : ''}${i.running ? '  (running)' : ''}`
/** Turn repeated --prop NAME=VALUE into a properties object keyed by property id. null = clear. Dies on unknown names. */
async function propsFrom(list) {
  const { config } = await api('/api/issue-config')
  const defs = config.properties.filter(p => !p.archived)
  const res = {}
  for (const kv of list) {
    const i = kv.indexOf('=')
    if (i < 1) die(`--prop needs NAME=VALUE, got "${kv}"`, 2)
    const key = kv.slice(0, i).trim().toLowerCase()
    const val = kv.slice(i + 1).trim()
    const def = defs.find(p => p.id.toLowerCase() === key || p.name.toLowerCase() === key)
    if (!def) die(`unknown property "${kv.slice(0, i)}". Known: ${defs.map(p => p.name).join(', ') || '(none)'}`, 2)
    if (val === '') { res[def.id] = null; continue }
    if (def.type === 'select') {
      const o = def.options.find(o => o.id === val || o.name.toLowerCase() === val.toLowerCase())
      if (!o) die(`"${val}" is not an option of ${def.name}. Options: ${def.options.map(o => o.name).join(', ')}`, 2)
      res[def.id] = o.id
    } else res[def.id] = val
  }
  return res
}
const out = (o, json, text) => console.log(json ? JSON.stringify(o, null, 2) : text)

/** A status change that would start a run on an assigned issue is refused. */
function guardRun(issue, status) {
  if (issue.assignee && RUNNING.includes(status) && issue.status !== status) {
    die(`${issue.id} is assigned to @${issue.assignee}. Moving it to ${status} would start an agent run. Use backlog, in_review, blocked, done or cancelled.`)
  }
}

let [cmd, ...rest] = process.argv.slice(2)
const { pos, opt } = parse(rest)

// property and label verbs are sugar over update, so merge and validation live in one place
if (cmd === 'property' || cmd === 'label') {
  const key = needKey(pos[0])
  const [verb, ...args] = pos.slice(1)
  const noun = cmd
  if (verb === undefined) {
    const { issue } = await api(`/api/issues/${key}`)
    if (noun === 'label') out(issue.labels ?? [], opt.json, (issue.labels ?? []).join(', ') || '(no labels)')
    else {
      const { config } = await api('/api/issue-config')
      const rows = Object.entries(issue.properties ?? {}).map(([id, v]) => {
        const d = config.properties.find(p => p.id === id)
        return [d?.name ?? id, d?.type === 'select' ? d.options.find(o => o.id === v)?.name ?? v : v]
      })
      out(Object.fromEntries(rows), opt.json, rows.map(([n, v]) => `${n}: ${v}`).join('\n') || '(no properties)')
    }
    process.exit(0)
  }
  if (!args.length && !(noun === 'label' && verb === 'set')) die(`${noun} ${verb} needs at least one value`, 2)
  if (noun === 'property' && verb === 'set') opt.prop = args
  else if (noun === 'property' && verb === 'unset') opt.prop = args.map(n => `${n}=`)
  else if (noun === 'label' && verb === 'add') opt['add-label'] = args
  else if (noun === 'label' && verb === 'remove') opt['remove-label'] = args
  else if (noun === 'label' && verb === 'set') opt.label = args.join(',')
  else die(`unknown ${noun} verb "${verb}". Use ${noun === 'property' ? 'set, unset' : 'add, remove, set'}`, 2)
  pos.length = 1
  cmd = 'update'
}

if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') { console.log(USAGE); process.exit(0) }

if (cmd === 'list') {
  const { issues } = await api('/api/issues?all=1')
  let rows = issues
  if (opt.status) rows = rows.filter(i => i.status === checkStatus(opt.status))
  if (opt.label) rows = rows.filter(i => i.labels?.some(l => l.toLowerCase() === opt.label.toLowerCase()))
  rows = rows.slice(0, Number(opt.limit) || 200)
  out(rows.map(({ description, ...r }) => r), opt.json, rows.length ? rows.map(line).join('\n') : 'no issues')
} else if (cmd === 'get') {
  const key = needKey(pos[0])
  const { issue, liveCommentIds, descriptionHash } = await api(`/api/issues/${key}`)
  const n = Number(opt.comments ?? 5)
  const live = new Set(liveCommentIds)
  const all = issue.timeline.filter(e => e.type === 'comment')
  const comments = (opt.live ? all.filter(c => live.has(c.id)) : all).slice(-n)
  const folded = all.length - all.filter(c => live.has(c.id)).length
  if (opt.json) out({ ...issue, timeline: undefined, comments, descriptionHash, foldedComments: folded }, true)
  else {
    console.log(`${line(issue)}\nproject: ${issue.projectDir}  updated: ${issue.updatedAt}  hash: ${descriptionHash}\n\n${issue.description || '(no description)'}`)
    if (comments.length) console.log(`\n--- ${opt.live ? 'live' : 'last'} ${comments.length} comment(s) ---\n` + comments.map(c => `[${c.id} ${c.author} ${c.at}]\n${c.body}`).join('\n\n'))
    if (opt.live && folded) console.log(`\n(${folded} older comment(s) are folded into the description. Read them with: claude-ui issue get ${key} --comments 200)`)
  }
} else if (cmd === 'create') {
  if (!opt.title) die('--title is required', 2)
  const payload = {
    title: opt.title,
    description: body(opt) ?? '',
    status: checkStatus(opt.status ?? 'backlog'),
    priority: checkPriority(opt.priority ?? 'none'),
    labels: opt.label ? csv(opt.label) : [],
    projectDir: opt.project || process.env.CLAUDE_UI_PROJECT || process.cwd(),
    permissionMode: 'plan',
    assignee: null,
  }
  if (opt.parent) payload.parentId = needKey(opt.parent)
  if (opt.prop) {
    const set = await propsFrom(opt.prop)
    payload.properties = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== null))
  }
  const { issue } = await api('/api/issues', { method: 'POST', body: JSON.stringify(payload) })
  out(issue, opt.json, `created ${line(issue)}`)
} else if (cmd === 'update') {
  const key = needKey(pos[0])
  const { issue: cur } = await api(`/api/issues/${key}`)
  const patch = {}
  if (opt.title !== undefined) patch.title = opt.title
  const b = body(opt)
  if (b !== undefined) patch.description = b
  if (opt.priority !== undefined) patch.priority = checkPriority(opt.priority)
  if (opt.label !== undefined || opt['add-label'] || opt['remove-label']) {
    let labels = opt.label !== undefined ? csv(opt.label) : [...(cur.labels ?? [])]
    for (const l of opt['add-label'] ?? []) if (!labels.some(x => x.toLowerCase() === l.toLowerCase())) labels.push(l)
    for (const l of opt['remove-label'] ?? []) labels = labels.filter(x => x.toLowerCase() !== l.toLowerCase())
    patch.labels = labels
  }
  if (opt.prop) {
    // PUT replaces the whole properties object, so merge into the current values
    const props = { ...(cur.properties ?? {}) }
    for (const [id, v] of Object.entries(await propsFrom(opt.prop))) {
      if (v === null) delete props[id]
      else props[id] = v
    }
    patch.properties = props
  }
  if (!Object.keys(patch).length) die('nothing to update. Pass --title, --body, --priority, --prop or a label flag', 2)
  const { issue } = await api(`/api/issues/${key}`, { method: 'PUT', body: JSON.stringify(patch) })
  out(issue, opt.json, `updated ${line(issue)}`)
} else if (cmd === 'move') {
  const key = needKey(pos[0])
  const status = checkStatus(pos[1])
  const { issue: cur } = await api(`/api/issues/${key}`)
  guardRun(cur, status)
  const { issue } = await api(`/api/issues/${key}`, { method: 'PUT', body: JSON.stringify({ status }) })
  out(issue, opt.json, `moved ${line(issue)}`)
} else if (cmd === 'comment') {
  const key = needKey(pos[0])
  const text = body(opt)
  if (!text || !text.trim()) die('comment is empty. Pass --body or --body-file', 2)
  await api(`/api/issues/${key}/comments`, { method: 'POST', body: JSON.stringify({ body: text }) })
  console.log(`commented on ${key}`)
} else if (cmd === 'fold') {
  const key = needKey(pos[0])
  const payload = {}
  if (opt.ids !== undefined) payload.commentIds = csv(opt.ids)
  if (opt.note !== undefined) payload.note = opt.note
  if (opt['if-hash'] !== undefined) payload.ifDescriptionHash = opt['if-hash']
  const b = body(opt)
  if (b !== undefined) payload.description = b
  const { folded } = await api(`/api/issues/${key}/fold`, { method: 'POST', body: JSON.stringify(payload) })
  console.log(`folded ${folded} comment(s) on ${key}${b !== undefined ? ', description replaced' : ''}`)
} else {
  die(`unknown command "${cmd}". Run: claude-ui issue help`, 2)
}
