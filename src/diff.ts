export type DiffPart = { kind: 'equal' | 'delete' | 'insert'; text: string };
export type TextDiff = { parts: DiffPart[]; coarse: boolean };

// Word segmentation keeps English words and Unicode graphemes intact, and
// recognizes word boundaries in Chinese/Japanese without changing whitespace.
const segmenter = new Intl.Segmenter('en', { granularity: 'word' });
const MAX_CELLS = 1_000_000;
export function diffText(before: string, after: string): TextDiff {
  const parts: DiffPart[] = [];
  const append = (kind: DiffPart['kind'], text: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  if (before === after) return { parts: before ? [{ kind: 'equal', text: before }] : [], coarse: false };
  const a = Array.from(segmenter.segment(before), s => s.segment);
  const b = Array.from(segmenter.segment(after), s => s.segment);
  let start = 0, aEnd = a.length, bEnd = b.length;
  while (start < aEnd && start < bEnd && a[start] === b[start]) start++;
  while (aEnd > start && bEnd > start && a[aEnd - 1] === b[bEnd - 1]) { aEnd--; bEnd--; }
  append('equal', a.slice(0, start).join(''));
  const n = aEnd - start, m = bEnd - start;
  const coarse = n > 0 && m > 0 && (n + 1) * (m + 1) > MAX_CELLS;
  if (!n || !m || coarse) {
    // Bound memory/work for heavily rewritten long text; never truncate it.
    append('delete', a.slice(start, aEnd).join(''));
    append('insert', b.slice(start, bEnd).join(''));
  } else {
    const width = m + 1, lengths = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      lengths[i * width + j] = a[start + i] === b[start + j]
        ? 1 + lengths[(i + 1) * width + j + 1]
        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        append('equal', a[start + i]); i++; j++;
      } else if (i < n && (j === m || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) {
        append('delete', a[start + i++]);
      } else append('insert', b[start + j++]);
    }
  }
  append('equal', a.slice(aEnd).join(''));
  return { parts, coarse };
}
