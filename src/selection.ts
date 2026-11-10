import {unsupportedEditor} from './editor-support';
export type Snapshot = {
  text: string; rect: DOMRect; target?: HTMLInputElement | HTMLTextAreaElement | HTMLElement;
  kind: 'read' | 'input' | 'rich'; value?: string; start?: number; end?: number; range?: Range;
  stale?: boolean; onStale?: () => void; observer?: MutationObserver; cleanup?: () => void; rangeText?: string;
};
export function sensitiveFieldActive(): boolean {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active instanceof HTMLInputElement && active.type === 'password';
}
function editable(node: Node | null): HTMLElement | undefined {
  let el = node instanceof HTMLElement ? node : node?.parentElement;
  if (!el?.isContentEditable) return;
  while (el.parentElement?.isContentEditable) el = el.parentElement;
  return el;
}
const GMAIL_HINT = '.jKzJCd[contenteditable="false"]';
function isHint(node: Node): boolean {
  return location.hostname === 'mail.google.com' && !!(node instanceof Element ? node : node.parentElement)?.closest(GMAIL_HINT);
}
function cleanCopy<T extends ParentNode>(copy: T): T {
  if (location.hostname === 'mail.google.com') copy.querySelectorAll(GMAIL_HINT).forEach(el => el.remove());
  return copy;
}
function richSignature(target: HTMLElement): string {
  // Gmail's spelling/grammar annotations wrap text without changing the document.
  // Ignore only these known neutral wrappers, not arbitrary editor markup.
  const copy = cleanCopy(target.cloneNode(true) as HTMLElement);
  copy.querySelectorAll('span[aria-invalid="grammar"],span[aria-invalid="spelling"],span[data-ddnwab-gr]').forEach(el => el.replaceWith(...el.childNodes));
  copy.normalize();
  return copy.innerHTML;
}
function selectedText(range: Range): string {
  const fragment = cleanCopy(range.cloneContents());
  let text = '';
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { text += node.textContent; return; }
    if (node instanceof Element && node.tagName === 'BR') { text += '\n'; return; }
    const block = node instanceof Element && /^(DIV|P|LI|BLOCKQUOTE|PRE|H[1-6])$/.test(node.tagName);
    if (block && text && !text.endsWith('\n')) text += '\n';
    node.childNodes.forEach(visit);
    if (block && text && !text.endsWith('\n')) text += '\n';
  };
  visit(fragment);
  return text.trim();
}
function rangeAtOffsets(target: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, { acceptNode: node => isHint(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const range = document.createRange();
  let offset = 0, started = false, node: Node | null;
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length || 0;
    // Prefer the next text node at a start boundary, preserving preceding BRs.
    if (!started && offset + length > start) { range.setStart(node, start - offset); started = true; }
    if (started && offset + length >= end) { range.setEnd(node, end - offset); return range; }
    offset += length;
  }
  return null;
}
function watch(s: Snapshot) {
  const dirty = () => { if (s.stale) return; s.stale = true; queueMicrotask(() => s.onStale?.()); };
  s.target?.addEventListener('input', dirty);
  s.target?.addEventListener('change', dirty);
  s.target?.addEventListener('compositionstart', dirty);
  if (s.kind === 'rich') {
    s.observer = new MutationObserver(() => { if (richSignature(s.target!) !== s.value) dirty(); });
    s.observer.observe(s.target!, { subtree: true, childList: true, characterData: true, attributes: true });
  }
  if (s.kind === 'read' && s.range) {
    const node = s.range.commonAncestorContainer;
    const parent = node.parentElement || node;
    s.observer = new MutationObserver(() => { if (!snapshotCurrent(s)) dirty(); });
    s.observer.observe(parent, { subtree: true, childList: true, characterData: true });
  }
  s.cleanup = () => {
    s.observer?.disconnect();
    s.target?.removeEventListener('input', dirty);
    s.target?.removeEventListener('change', dirty);
    s.target?.removeEventListener('compositionstart', dirty);
  };
  return s;
}
export function capture(): Snapshot | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    if (active instanceof HTMLInputElement && !['text','search','url','tel'].includes(active.type)) return null;
    const start = active.selectionStart, end = active.selectionEnd;
    if (start === null || end === null || start === end) return null;
    const text = active.value.slice(start, end);
    if (!text.trim()) return null;
    return watch({ text, rect: active.getBoundingClientRect(), kind: active.disabled || active.readOnly || unsupportedEditor(active) ? 'read' : 'input', target: active, value: active.value, start, end });
  }
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed || !selection.toString().trim()) return null;
  let range = selection.getRangeAt(0).cloneRange();
  const target = editable(range.startContainer);
  // Rich editor frameworks own their document model. Direct DOM edits are unsafe there.
  const unsupported = target && unsupportedEditor(target) || location.hostname === 'docs.google.com';
  const safe = target && !unsupported && target === editable(range.endContainer) &&
    !Array.from(target.querySelectorAll('[contenteditable="false"],img,table,iframe,input,textarea,video')).some(el => !isHint(el));
  let start: number | undefined, end: number | undefined;
  if (safe) {
    const prefix = document.createRange(); prefix.selectNodeContents(target); prefix.setEnd(range.startContainer, range.startOffset);
    const prefixLength = cleanCopy(prefix.cloneContents()).textContent?.length || 0;
    const raw = cleanCopy(range.cloneContents()).textContent || '';
    start = prefixLength + (raw.length - raw.trimStart().length);
    end = prefixLength + raw.trimEnd().length;
    if (start >= end) return null;
    const normalized = rangeAtOffsets(target, start, end);
    if (!normalized) return null;
    range = normalized;
  }
  const rects = range.getClientRects();
  return watch({ text: safe ? selectedText(range) : selection.toString(), rect: rects.length ? rects[rects.length - 1] : range.getBoundingClientRect(), range, rangeText: cleanCopy(range.cloneContents()).textContent || '', start, end, kind: safe ? 'rich' : 'read', target: safe ? target : undefined, value: safe ? richSignature(target) : undefined });
}
export function snapshotCurrent(s: Snapshot): boolean {
  if (s.stale) return false;
  if (s.kind !== 'read') return canReplace(s);
  if (s.target) return s.target.isConnected && (s.target as HTMLInputElement).value === s.value;
  if (s.range) return s.range.startContainer.isConnected && s.range.endContainer.isConnected &&
    (cleanCopy(s.range.cloneContents()).textContent || '') === s.rangeText;
  return true; // A manually submitted sidebar/context-menu source is an immutable copy.
}
export function canReplace(s: Snapshot): boolean {
  if (!s.target?.isConnected || s.stale || s.kind === 'read' || unsupportedEditor(s.target)) return false;
  if (s.kind === 'input') {
    const el = s.target as HTMLInputElement | HTMLTextAreaElement;
    return !el.disabled && !el.readOnly && el.value === s.value && el.value.slice(s.start, s.end) === s.text;
  }
  s.observer?.takeRecords();
  if (richSignature(s.target) !== s.value) s.stale = true;
  if (s.stale || !s.target.isContentEditable) return false;
  // The full document fingerprint is unchanged; remap exact offsets after annotations.
  const range = rangeAtOffsets(s.target, s.start!, s.end!);
  if (!range || (cleanCopy(range.cloneContents()).textContent || '') !== s.rangeText) return false;
  s.range = range;
  return true;
}
function focused(target:HTMLElement) {
  let active=document.activeElement;while(active?.shadowRoot?.activeElement)active=active.shadowRoot.activeElement;return active===target;
}
export function replaceSelection(s: Snapshot, result: string): void {
  if (!canReplace(s)) throw new Error('原文已变化或选区已失效，请重新划选。结果仍可复制。');
  if (!result) throw new Error('结果为空，无法替换。');
  if (s.kind === 'input') {
    const target = s.target as HTMLInputElement | HTMLTextAreaElement;
    target.focus({ preventScroll: true });
    target.setSelectionRange(s.start!, s.end!);
    // Focusing can trigger site handlers; check again before touching content.
    if (!canReplace(s)||!focused(target)) throw new Error('编辑框内容已变化，请重新划选。');
    const expected = s.value!.slice(0, s.start) + result + s.value!.slice(s.end);
    if (!document.execCommand('insertText', false, result)) throw new Error('此编辑框不支持可靠替换，请使用复制。');
    s.stale = true; s.cleanup?.();
    if (target.value !== expected) throw new Error('网站重新处理了文字，请检查编辑框内容；可按撤销恢复。');
  } else {
    const target = s.target!;
    target.focus({ preventScroll: true });
    if (!canReplace(s)||!focused(target)) throw new Error('编辑区已变化，请重新划选。');
    const original = cleanCopy(target.cloneNode(true) as HTMLElement).textContent || '';
    const expected = original.slice(0,s.start) + result + original.slice(s.end);
    const selection = window.getSelection();
    selection?.removeAllRanges(); selection?.addRange(s.range!);
    if (!document.execCommand('insertText', false, result)) throw new Error('此编辑区不支持可靠替换，请使用复制。');
    s.stale = true; s.cleanup?.();
    // Chrome may represent inserted newlines as BR/DIV and spaces as NBSP.
    const comparable = (text: string) => text.replace(/[\r\n]/g,'').replace(/\u00a0/g,' ');
    const actual = cleanCopy(target.cloneNode(true) as HTMLElement).textContent || '';
    if (comparable(actual) !== comparable(expected)) throw new Error('网站重新处理了文字，请检查编辑区内容；可按撤销恢复。');
  }
  s.cleanup?.();
}
