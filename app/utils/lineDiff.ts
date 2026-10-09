export type DiffLineType = 'same' | 'add' | 'del'

export interface DiffSegment {
  text: string
  /** True for the part of a changed line that differs from its counterpart */
  changed: boolean
}

export interface DiffLine {
  type: DiffLineType
  text: string
  /** Word-level breakdown, set on paired removed/added lines */
  segments?: DiffSegment[]
  /** 1-based line number in the original text (absent for additions) */
  oldNo?: number
  /** 1-based line number in the new text (absent for deletions) */
  newNo?: number
}

export interface DiffRow extends Partial<DiffLine> {
  /** Set on a collapsed run of unchanged lines */
  collapsed?: number
}

/** Line-based diff (LCS). Common prefix/suffix are trimmed first so typical edits stay cheap. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--
    endB--
  }

  const out: DiffLine[] = []
  for (let i = 0; i < start; i++) out.push({ type: 'same', text: a[i]!, oldNo: i + 1, newNo: i + 1 })

  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const n = midA.length
  const m = midB.length

  if (n * m > 4_000_000) {
    // Too large for the DP table: show the middle as a plain replace
    midA.forEach((t, i) => out.push({ type: 'del', text: t, oldNo: start + i + 1 }))
    midB.forEach((t, i) => out.push({ type: 'add', text: t, newNo: start + i + 1 }))
  } else {
    // lcs[i][j] = LCS length of midA[i..] and midB[j..]
    const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i]![j] = midA[i] === midB[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
      }
    }
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        out.push({ type: 'same', text: midA[i]!, oldNo: start + i + 1, newNo: start + j + 1 })
        i++
        j++
      } else if (i < n && (j === m || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
        // Removed lines come before added ones, as on GitHub / GitLab
        out.push({ type: 'del', text: midA[i]!, oldNo: start + i + 1 })
        i++
      } else {
        out.push({ type: 'add', text: midB[j]!, newNo: start + j + 1 })
        j++
      }
    }
  }

  for (let k = 0; k < a.length - endA; k++) {
    out.push({ type: 'same', text: a[endA + k]!, oldNo: endA + k + 1, newNo: endB + k + 1 })
  }
  pairInlineChanges(out)
  return out
}

const TOKEN_RE = /\s+|\w+|[^\w\s]/g

/** Word-level diff of two lines. Returns null when the lines share too little to be worth highlighting. */
export function inlineDiff(oldLine: string, newLine: string): { old: DiffSegment[]; new: DiffSegment[] } | null {
  const a = oldLine.match(TOKEN_RE) ?? []
  const b = newLine.match(TOKEN_RE) ?? []
  if (a.length * b.length > 250_000) return null

  const lcs: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }
  const common = lcs[0]![0]!
  // Mostly different lines read better as a plain full-line change
  if (common / Math.max(a.length, b.length, 1) < 0.4) return null

  const oldSegs: DiffSegment[] = []
  const newSegs: DiffSegment[] = []
  const push = (segs: DiffSegment[], text: string, changed: boolean) => {
    const last = segs[segs.length - 1]
    if (last && last.changed === changed) last.text += text
    else segs.push({ text, changed })
  }
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push(oldSegs, a[i]!, false)
      push(newSegs, b[j]!, false)
      i++
      j++
    } else if (i < a.length && (j === b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      push(oldSegs, a[i]!, true)
      i++
    } else {
      push(newSegs, b[j]!, true)
      j++
    }
  }
  return { old: oldSegs, new: newSegs }
}

/** Pair each removed line with the added line at the same position in a changed block and mark the differing words. */
function pairInlineChanges(lines: DiffLine[]) {
  let i = 0
  while (i < lines.length) {
    if (lines[i]!.type !== 'del') {
      i++
      continue
    }
    let delEnd = i
    while (delEnd < lines.length && lines[delEnd]!.type === 'del') delEnd++
    let addEnd = delEnd
    while (addEnd < lines.length && lines[addEnd]!.type === 'add') addEnd++
    const pairs = Math.min(delEnd - i, addEnd - delEnd)
    for (let k = 0; k < pairs; k++) {
      const d = lines[i + k]!
      const a = lines[delEnd + k]!
      const res = inlineDiff(d.text, a.text)
      if (res) {
        d.segments = res.old
        a.segments = res.new
      }
    }
    i = addEnd
  }
}

/** Collapse long runs of unchanged lines, keeping `context` lines around each change. */
export function collapseUnchanged(lines: DiffLine[], context = 3): DiffRow[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.type === 'same') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  })
  const rows: DiffRow[] = []
  let skipped = 0
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) {
        rows.push({ collapsed: skipped })
        skipped = 0
      }
      rows.push(l)
    } else {
      skipped++
    }
  })
  if (skipped) rows.push({ collapsed: skipped })
  return rows
}
