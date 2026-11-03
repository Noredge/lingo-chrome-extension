import { l as localize, s as setLanguage } from "./i18n-C0rG16O5.js";
import { M as MODES, b as MAX_TEXT, D as DEFAULTS } from "./core-D6yPLxNU.js";
function sensitiveFieldActive() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active instanceof HTMLInputElement && active.type === "password";
}
function editable(node) {
  let el = node instanceof HTMLElement ? node : node?.parentElement;
  if (!el?.isContentEditable) return;
  while (el.parentElement?.isContentEditable) el = el.parentElement;
  return el;
}
const GMAIL_HINT = '.jKzJCd[contenteditable="false"]';
function isHint(node) {
  return location.hostname === "mail.google.com" && !!(node instanceof Element ? node : node.parentElement)?.closest(GMAIL_HINT);
}
function cleanCopy(copy) {
  if (location.hostname === "mail.google.com") copy.querySelectorAll(GMAIL_HINT).forEach((el) => el.remove());
  return copy;
}
function richSignature(target) {
  const copy = cleanCopy(target.cloneNode(true));
  copy.querySelectorAll('span[aria-invalid="grammar"],span[aria-invalid="spelling"],span[data-ddnwab-gr]').forEach((el) => el.replaceWith(...el.childNodes));
  copy.normalize();
  return copy.innerHTML;
}
function selectedText(range) {
  const fragment = cleanCopy(range.cloneContents());
  let text = "";
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
      return;
    }
    if (node instanceof Element && node.tagName === "BR") {
      text += "\n";
      return;
    }
    const block = node instanceof Element && /^(DIV|P|LI|BLOCKQUOTE|PRE|H[1-6])$/.test(node.tagName);
    if (block && text && !text.endsWith("\n")) text += "\n";
    node.childNodes.forEach(visit);
    if (block && text && !text.endsWith("\n")) text += "\n";
  };
  visit(fragment);
  return text.trim();
}
function rangeAtOffsets(target, start, end) {
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, { acceptNode: (node2) => isHint(node2) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const range = document.createRange();
  let offset = 0, started = false, node;
  while (node = walker.nextNode()) {
    const length = node.textContent?.length || 0;
    if (!started && offset + length > start) {
      range.setStart(node, start - offset);
      started = true;
    }
    if (started && offset + length >= end) {
      range.setEnd(node, end - offset);
      return range;
    }
    offset += length;
  }
  return null;
}
function watch(s) {
  if (!s.target) return s;
  const dirty = () => {
    s.stale = true;
  };
  s.target.addEventListener("input", dirty);
  s.target.addEventListener("change", dirty);
  s.target.addEventListener("compositionstart", dirty);
  if (s.kind === "rich") {
    s.observer = new MutationObserver(() => {
      if (richSignature(s.target) !== s.value) dirty();
    });
    s.observer.observe(s.target, { subtree: true, childList: true, characterData: true, attributes: true });
  }
  s.cleanup = () => {
    s.observer?.disconnect();
    s.target?.removeEventListener("input", dirty);
    s.target?.removeEventListener("change", dirty);
    s.target?.removeEventListener("compositionstart", dirty);
  };
  return s;
}
function capture() {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    if (active instanceof HTMLInputElement && !["text", "search", "url", "tel"].includes(active.type)) return null;
    const start2 = active.selectionStart, end2 = active.selectionEnd;
    if (start2 === null || end2 === null || start2 === end2) return null;
    const text = active.value.slice(start2, end2);
    if (!text.trim()) return null;
    return watch({ text, rect: active.getBoundingClientRect(), kind: active.disabled || active.readOnly ? "read" : "input", target: active, value: active.value, start: start2, end: end2 });
  }
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed || !selection.toString().trim()) return null;
  let range = selection.getRangeAt(0).cloneRange();
  const target = editable(range.startContainer);
  const unsupported = target?.closest(".ProseMirror,.monaco-editor,.CodeMirror,[data-lexical-editor],[data-slate-editor],.ql-editor,.kix-appview-editor") || location.hostname === "docs.google.com";
  const safe = target && !unsupported && target === editable(range.endContainer) && !Array.from(target.querySelectorAll('[contenteditable="false"],img,table,iframe,input,textarea,video')).some((el) => !isHint(el));
  let start, end;
  if (safe) {
    const prefix = document.createRange();
    prefix.selectNodeContents(target);
    prefix.setEnd(range.startContainer, range.startOffset);
    const prefixLength = cleanCopy(prefix.cloneContents()).textContent?.length || 0;
    const raw = cleanCopy(range.cloneContents()).textContent || "";
    start = prefixLength + (raw.length - raw.trimStart().length);
    end = prefixLength + raw.trimEnd().length;
    if (start >= end) return null;
    const normalized = rangeAtOffsets(target, start, end);
    if (!normalized) return null;
    range = normalized;
  }
  const rects = range.getClientRects();
  return watch({ text: safe ? selectedText(range) : selection.toString(), rect: rects.length ? rects[rects.length - 1] : range.getBoundingClientRect(), range, rangeText: cleanCopy(range.cloneContents()).textContent || "", start, end, kind: safe ? "rich" : "read", target: safe ? target : void 0, value: safe ? richSignature(target) : void 0 });
}
function canReplace(s) {
  if (!s.target?.isConnected || s.stale || s.kind === "read") return false;
  if (s.kind === "input") {
    const el = s.target;
    return !el.disabled && !el.readOnly && el.value === s.value && el.value.slice(s.start, s.end) === s.text;
  }
  s.observer?.takeRecords();
  if (richSignature(s.target) !== s.value) s.stale = true;
  if (s.stale || !s.target.isContentEditable) return false;
  const range = rangeAtOffsets(s.target, s.start, s.end);
  if (!range || (cleanCopy(range.cloneContents()).textContent || "") !== s.rangeText) return false;
  s.range = range;
  return true;
}
function replaceSelection(s, result) {
  if (!canReplace(s)) throw new Error("原文已变化或选区已失效，请重新划选。结果仍可复制。");
  if (!result) throw new Error("结果为空，无法替换。");
  if (s.kind === "input") {
    const target = s.target;
    target.focus({ preventScroll: true });
    target.setSelectionRange(s.start, s.end);
    if (!canReplace(s)) throw new Error("编辑框内容已变化，请重新划选。");
    const expected = s.value.slice(0, s.start) + result + s.value.slice(s.end);
    if (!document.execCommand("insertText", false, result)) throw new Error("此编辑框不支持可靠替换，请使用复制。");
    s.stale = true;
    s.cleanup?.();
    if (target.value !== expected) throw new Error("网站重新处理了文字，请检查编辑框内容；可按撤销恢复。");
  } else {
    const target = s.target;
    target.focus({ preventScroll: true });
    if (!canReplace(s)) throw new Error("编辑区已变化，请重新划选。");
    const original = cleanCopy(target.cloneNode(true)).textContent || "";
    const expected = original.slice(0, s.start) + result + original.slice(s.end);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(s.range);
    if (!document.execCommand("insertText", false, result)) throw new Error("此编辑区不支持可靠替换，请使用复制。");
    s.stale = true;
    s.cleanup?.();
    const comparable = (text) => text.replace(/[\r\n]/g, "").replace(/\u00a0/g, " ");
    const actual = cleanCopy(target.cloneNode(true)).textContent || "";
    if (comparable(actual) !== comparable(expected)) throw new Error("网站重新处理了文字，请检查编辑区内容；可按撤销恢复。");
  }
  s.cleanup?.();
}
const css = `:host{all:initial;font-size:14px;color:#253a34;color-scheme:light}.panel,.launcher{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;line-height:1.5}
*{box-sizing:border-box} [hidden]{display:none!important} button,input,select{font:inherit}button,select{cursor:pointer}button{border:1px solid #dce5df;background:#fff;color:#344b41;border-radius:9px;padding:7px 12px;line-height:1.4}button:hover{background:#eef4ef;border-color:#c0d1c6}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #578e70;outline-offset:3px}button:disabled{opacity:.4;cursor:not-allowed}button:active{transform:translateY(1px)}
.launcher{position:fixed;width:34px;height:34px;padding:0;background:#234f3f;color:white;border:2px solid #fff;border-radius:11px;box-shadow:0 3px 14px #173d3333;font-size:17px;font-weight:600}.launcher:hover{background:#35694f;color:white}
.panel{position:fixed;width:390px;min-width:min(320px,calc(100vw - 20px));min-height:min(300px,calc(100vh - 20px));max-width:min(900px,calc(100vw - 20px));max-height:calc(100vh - 20px);display:flex;flex-direction:column;background:#fffefa;border:1px solid #d9e1d8;border-radius:18px;box-shadow:0 16px 60px #152e3326,0 3px 9px #152e3310;overflow:hidden;font-size:13px;text-align:left;letter-spacing:normal}
header{display:flex;align-items:center;justify-content:space-between;padding:17px 18px 15px;border-bottom:1px solid #e9ede5;background:#f5f7ef;flex-shrink:0}.brand{display:flex;gap:10px;align-items:center}.logo{display:grid;place-items:center;width:35px;height:35px;background:#234f3f;color:#fff;border-radius:11px;font-size:20px}.brand strong{font-size:17px;letter-spacing:-.4px;font-weight:650;display:block}.brand small{font-size:10px;color:#7a887d;display:block;margin-top:1px}.header-actions{display:flex;gap:4px}.icon{background:transparent;border:0;font-size:21px;width:30px;height:30px;padding:0;color:#738277}
.body{overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.source{margin:14px 18px 0;color:#778379}.source summary{font-size:11px;cursor:pointer;user-select:none}.count{float:right;font-variant-numeric:tabular-nums;font-size:10px;color:#98a097}.source-text{max-height:130px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f5ef;padding:10px;border-radius:8px;margin-top:8px;color:#56615b;font-size:12px}
.translation,.writing{padding:16px 18px}.writing{border-top:1px solid #e6eae2;padding-top:17px;background:#fdfcf8}.section-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.eyebrow{font-size:11px;font-weight:650;color:#627c69;letter-spacing:1px}.language{border:0;background:#edf2e9;border-radius:6px;color:#566d5d;padding:3px 6px;font-size:11px;max-width:145px}.hint{font-size:10px;color:#92998e}.result{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.8;user-select:text;max-height:240px;overflow:auto;color:#253a34}.result.loading{height:42px;background:linear-gradient(110deg,#f0f2e9 25%,#fafbf6 45%,#f0f2e9 65%);background-size:200% 100%;border-radius:6px;animation:shimmer 1.8s infinite}.result-status{font-size:11px;color:#8a968a;margin-top:8px}.result-status:empty{display:none}.result-status.error{color:#a4573f;background:#fff2e9;padding:9px 10px;border-radius:8px;line-height:1.6}.result-actions{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap}.result-actions:empty{display:none}.result-actions button{font-size:11px;padding:5px 10px}.primary{background:#234f3f;color:white;border-color:#234f3f}.primary:hover{background:#35694f;color:white;border-color:#35694f}
.presets{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.presets button{font-size:12px;background:#fffefa;padding:8px 3px}.presets button.selected{background:#e6eee2;border-color:#afc4ad;color:#244f36;font-weight:600}.custom{display:flex;gap:6px;border:1px solid #dce3d8;border-radius:9px;background:white;padding:4px;margin:12px 0 0}.custom input{width:100%;min-width:0;border:0;background:transparent;font-size:12px;padding:5px 7px;color:#344b41}.custom input::placeholder{color:#9bA297}.custom button{padding:3px 10px;background:#eff3e9;border:0;color:#507347;font-size:19px}.write-output{border-top:1px dashed #dce3d6;margin-top:16px;padding-top:14px}.write-label{font-size:11px;color:#6d876a;margin-bottom:8px;font-weight:600}footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 18px;background:#f5f6f0;border-top:1px solid #e6eae0;flex-shrink:0;line-height:1.5}.notice{font-size:10px;color:#788477}.model{font-size:9px;color:#8d9888;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis}
@keyframes shimmer{to{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}

.drag-handle{cursor:grab;touch-action:none;user-select:none}.drag-handle:focus-visible{outline:2px solid #578e70;outline-offset:-4px}.adjusting .drag-handle{cursor:grabbing}.adjusting{user-select:none}.body{flex:1;min-height:0}
.resize-handle,.resize-handle:hover,.resize-handle:active{position:absolute;z-index:3;padding:0;border:0;border-radius:0;background:transparent;transform:none;touch-action:none;box-shadow:none}
.resize-handle[data-edge="n"],.resize-handle[data-edge="s"]{left:16px;right:16px;height:7px;cursor:ns-resize}
.resize-handle[data-edge="n"]{top:0}.resize-handle[data-edge="s"]{bottom:0}
.resize-handle[data-edge="e"],.resize-handle[data-edge="w"]{top:16px;bottom:16px;width:7px;cursor:ew-resize}
.resize-handle[data-edge="e"]{right:0}.resize-handle[data-edge="w"]{left:0}
.resize-handle[data-edge="ne"],.resize-handle[data-edge="nw"],.resize-handle[data-edge="se"],.resize-handle[data-edge="sw"]{width:16px;height:16px}
.resize-handle[data-edge="ne"]{top:0;right:0;cursor:nesw-resize}.resize-handle[data-edge="nw"]{top:0;left:0;cursor:nwse-resize}
.resize-handle[data-edge="se"]{bottom:0;right:0;cursor:nwse-resize}.resize-handle[data-edge="sw"]{bottom:0;left:0;cursor:nesw-resize}
.resize-handle:focus-visible{outline:2px solid #578e70;outline-offset:-3px}

.language{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='m2 4 4 4 4-4' fill='none' stroke='%23566d5d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:12px 12px;padding-right:32px;padding-left:12px}
@media(forced-colors:active){.language{appearance:auto;-webkit-appearance:auto;background-image:none;padding-right:8px}}
`;
const MIN_WIDTH = 320, MIN_HEIGHT = 300, MAX_WIDTH = 900, MARGIN = 10;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, Math.max(lo, hi)));
function resizeBounds(b, edge, dx, dy, viewport) {
  const minW = Math.min(MIN_WIDTH, Math.max(1, viewport.width - 2 * MARGIN));
  const minH = Math.min(MIN_HEIGHT, Math.max(1, viewport.height - 2 * MARGIN));
  let left = b.left, top = b.top, right = b.left + b.width, bottom = b.top + b.height;
  if (edge.includes("w")) left = clamp(left + dx, Math.max(MARGIN, right - MAX_WIDTH), right - minW);
  if (edge.includes("e")) right = clamp(right + dx, left + minW, Math.min(viewport.width - MARGIN, left + MAX_WIDTH));
  if (edge.includes("n")) top = clamp(top + dy, MARGIN, bottom - minH);
  if (edge.includes("s")) bottom = clamp(bottom + dy, top + minH, viewport.height - MARGIN);
  return { left, top, width: right - left, height: bottom - top };
}
function createPanel(options = {}) {
  const docked = !!options.container;
  const host = document.createElement("div");
  host.id = "lingo-extension-root";
  host.style.cssText = docked ? "display:block;height:100%;color-scheme:light" : "all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important;color-scheme:light!important";
  const root = host.attachShadow({ mode: "open" });
  localize(root);
  const style = document.createElement("style");
  style.textContent = css + (docked ? ".panel{position:relative;inset:auto!important;width:100%;height:100%;min-width:0;min-height:0;max-width:none;max-height:none;border:0;border-radius:0;box-shadow:none}.drag-handle{cursor:default}.model{max-width:45%}.result{max-height:none}.panel .source[hidden]{display:none!important}" : "");
  root.append(style);
  const launcher = document.createElement("button");
  launcher.className = "launcher";
  launcher.textContent = "文";
  launcher.title = "Lingo · 翻译与修改";
  launcher.setAttribute("aria-label", "用 Lingo 翻译选中文字");
  launcher.hidden = true;
  root.append(launcher);
  const panel2 = document.createElement("section");
  panel2.className = "panel";
  panel2.hidden = true;
  panel2.setAttribute("role", "dialog");
  panel2.setAttribute("aria-label", "Lingo 翻译与写作");
  root.append(panel2);
  panel2.innerHTML = `<header class="drag-handle" tabindex="0" role="group" aria-label="移动浮窗：拖动标题栏，或聚焦后用方向键移动" title="拖动标题栏移动浮窗"><div class="brand"><span class="logo">文</span><div><strong>Lingo</strong><small>读懂，也写得更好</small></div></div><div class="header-actions"><button data-action="reset-layout" class="icon" title="恢复默认位置和大小" aria-label="恢复默认位置和大小">↺</button><button data-action="settings" class="icon" title="打开设置" aria-label="打开设置">⚙</button><button data-action="close" class="icon" title="关闭 · Esc" aria-label="关闭">×</button></div></header>
    <div class="body"><details class="source"><summary>选中的原文 <span class="count"></span></summary><div class="source-text" translate="no" dir="auto"></div></details>
    <section class="translation"><div class="section-title"><span class="eyebrow">翻译</span><select aria-label="翻译目标语言" class="language"></select></div><div class="result translate-text" translate="no" dir="auto"></div><div class="result-status translate-status" role="status" aria-live="polite"></div><div class="result-actions translate-actions"></div></section>
    <section class="writing"><div class="section-title"><span class="eyebrow">写作工具</span><span class="hint">始终基于原文</span></div><div class="presets"></div><form class="custom"><input aria-label="自定义修改要求" maxlength="1000" placeholder="试试：更委婉一点…"><button type="submit" aria-label="执行自定义改写">↗</button></form><div class="write-output" hidden><div class="write-label"></div><div class="result write-text" translate="no" dir="auto"></div><div class="result-status write-status" role="status" aria-live="polite"></div><div class="result-actions write-actions"></div></div></section></div>
    <footer><span class="notice" role="status">仅发送选中文字</span><span class="model" translate="no"></span></footer>`;
  const $ = (s) => panel2.querySelector(s);
  const language = $(".language");
  const edges = docked ? [] : ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const edgeNames = { n: "上边", s: "下边", e: "右边", w: "左边", ne: "右上角", nw: "左上角", se: "右下角", sw: "左下角" };
  for (const edge of edges) {
    const handle = document.createElement("button");
    handle.className = "resize-handle";
    handle.dataset.edge = edge;
    handle.setAttribute("aria-label", `调整浮窗大小：${edgeNames[edge]}`);
    handle.tabIndex = edge === "se" ? 0 : -1;
    panel2.append(handle);
  }
  const modes = ["proofread", "natural", "professional", "friendly", "concise", "precise"];
  modes.forEach((mode) => {
    const b = document.createElement("button");
    b.textContent = MODES[mode];
    b.dataset.mode = mode;
    $(".presets").append(b);
  });
  let profileId = "";
  let settings = { ...DEFAULTS }, hasKey = false, hasVault = false, snap = null;
  let candidate = null, generation = 0, selectedMode = "proofread";
  let composing = false, lastPointer = { x: 30 }, activeWriting = "", activeTranslation = "";
  const results = /* @__PURE__ */ new Map();
  async function config() {
    try {
      const c = await chrome.runtime.sendMessage({ type: "config" });
      if (c?.settings) {
        const serviceChanged = profileId !== c.profileId || settings.baseUrl !== c.settings.baseUrl || settings.model !== c.settings.model;
        profileId = c.profileId;
        settings = c.settings;
        setLanguage(settings.uiLanguage);
        if (serviceChanged && !panel2.hidden) close();
        hasKey = c.hasKey;
        hasVault = c.hasVault;
      }
    } catch {
      notify("扩展已更新，请刷新网页后使用。");
    }
    language.replaceChildren(...settings.languages.map((l) => {
      const o = document.createElement("option");
      o.value = l;
      o.textContent = l.split("（")[0];
      o.translate = false;
      return o;
    }));
    language.value = settings.language;
    $(".model").textContent = new URL(settings.baseUrl).host + " · " + settings.model;
    $(".model").setAttribute("title", settings.baseUrl + "/responses");
    if (settings.blockedHosts.includes(location.hostname)) close();
  }
  void config();
  function mount() {
    if (!host.isConnected) (options.container || document.documentElement).append(host);
  }
  function blocked() {
    return settings.blockedHosts.includes(location.hostname);
  }
  function notify(text) {
    $(".notice").textContent = text;
  }
  let moved = false;
  let gesture = null;
  const clamp2 = (n, min, max) => Math.max(min, Math.min(n, Math.max(min, max)));
  function fitPanel() {
    if (panel2.hidden || docked) return;
    const r = panel2.getBoundingClientRect();
    panel2.style.left = `${clamp2(r.left, 10, innerWidth - r.width - 10)}px`;
    panel2.style.top = `${clamp2(r.top, 10, innerHeight - r.height - 10)}px`;
  }
  function position(el, rect) {
    if (docked) return;
    if (el === panel2 && moved) {
      fitPanel();
      return;
    }
    const width = el === launcher ? 34 : panel2.offsetWidth;
    const height = el === launcher ? 34 : panel2.offsetHeight;
    const left = clamp2(rect.left || lastPointer.x, 10, innerWidth - width - 10);
    let top = rect.bottom + 9;
    if (top + height > innerHeight - 10) top = rect.top - height - 9;
    el.style.left = `${left}px`;
    el.style.top = `${clamp2(top, 10, innerHeight - height - 10)}px`;
  }
  function resizeFrom(bounds, edge, dx, dy) {
    const r = resizeBounds(bounds, edge, dx, dy, { width: innerWidth, height: innerHeight });
    panel2.style.left = `${r.left}px`;
    panel2.style.top = `${r.top}px`;
    panel2.style.width = `${r.width}px`;
    panel2.style.height = `${r.height}px`;
  }
  function resetLayout() {
    if (docked) {
      close();
      return;
    }
    moved = false;
    panel2.style.width = "";
    panel2.style.height = "";
    if (snap) position(panel2, snap.rect);
  }
  function layoutControl(el, kind) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || kind === "move" && e.target.closest("button")) return;
      e.preventDefault();
      e.stopPropagation();
      const r = panel2.getBoundingClientRect();
      moved = true;
      gesture = { id: e.pointerId, kind, x: e.clientX, y: e.clientY, left: r.left, top: r.top, width: r.width, height: r.height };
      el.setPointerCapture(e.pointerId);
      panel2.classList.add("adjusting");
    });
    el.addEventListener("pointermove", (e) => {
      if (!gesture || gesture.id !== e.pointerId) return;
      const g = gesture, dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (g.kind === "move") {
        panel2.style.left = `${clamp2(g.left + dx, 10, innerWidth - panel2.offsetWidth - 10)}px`;
        panel2.style.top = `${clamp2(g.top + dy, 10, innerHeight - panel2.offsetHeight - 10)}px`;
      } else resizeFrom(g, g.kind, dx, dy);
    });
    const finish = () => {
      gesture = null;
      panel2.classList.remove("adjusting");
    };
    el.addEventListener("pointerup", finish);
    el.addEventListener("pointercancel", finish);
    el.addEventListener("lostpointercapture", finish);
    el.addEventListener("keydown", (e) => {
      if (e.target !== el || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      moved = true;
      const step = e.shiftKey ? 40 : 10, r = panel2.getBoundingClientRect();
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (kind !== "move") resizeFrom(r, kind, dx, dy);
      else {
        panel2.style.left = `${r.left + dx}px`;
        panel2.style.top = `${r.top + dy}px`;
        fitPanel();
      }
    });
  }
  if (!docked) layoutControl($(".drag-handle"), "move");
  for (const edge of edges) layoutControl($(`[data-edge="${edge}"]`), edge);
  new ResizeObserver(() => {
    if (!panel2.hidden && snap) position(panel2, snap.rect);
  }).observe(panel2);
  function stopAll() {
    results.forEach((r) => {
      clearTimeout(r.timer);
      r.port?.disconnect();
    });
    results.clear();
  }
  function close() {
    gesture = null;
    panel2.classList.remove("adjusting");
    generation++;
    stopAll();
    snap?.cleanup?.();
    candidate?.cleanup?.();
    snap = candidate = null;
    panel2.hidden = launcher.hidden = true;
    for (const selector of [".source-text", ".translate-text", ".write-text", ".translate-status", ".write-status", ".translate-actions", ".write-actions"]) $(selector).replaceChildren();
    $(".custom input").value = "";
    if (docked) {
      panel2.hidden = false;
      $(".source").hidden = true;
      $(".write-output").hidden = true;
      $(".translate-status").textContent = "在 PDF 中选中文字，然后右键用 Lingo 翻译。";
    }
  }
  function scan() {
    if (composing || blocked() || !panel2.hidden || root.activeElement) return;
    candidate?.cleanup?.();
    candidate = capture();
    if (!candidate || candidate.text.length > MAX_TEXT) {
      launcher.hidden = true;
      return;
    }
    mount();
    launcher.hidden = false;
    position(launcher, candidate.rect);
  }
  function show(snapshot) {
    $(".source").hidden = false;
    generation++;
    stopAll();
    snap?.cleanup?.();
    if (candidate && candidate !== snapshot) candidate.cleanup?.();
    snap = snapshot;
    candidate = null;
    activeWriting = activeTranslation = "";
    selectedMode = "proofread";
    $(".custom input").value = "";
    $(".write-output").hidden = true;
    $(".source-text").textContent = snapshot.text;
    $(".count").textContent = `${snapshot.text.length} 字符`;
    $(".source").open = false;
    mount();
    panel2.hidden = false;
    launcher.hidden = true;
    position(panel2, snapshot.rect);
    notify(snapshot.kind === "read" ? "仅发送选中文字 · 此处可复制结果" : "仅发送选中文字 · 可替换所选部分");
    language.value = settings.language;
    start("translate");
  }
  function key(mode, instruction) {
    return JSON.stringify([mode, mode === "translate" ? language.value : "", instruction]);
  }
  function start(mode, instruction = "") {
    if (!snap) return;
    const k = key(mode, instruction);
    if (mode === "translate") {
      if (activeTranslation !== k) cancelResult(activeTranslation);
      activeTranslation = k;
    } else {
      if (activeWriting !== k) cancelResult(activeWriting);
      selectedMode = mode;
      activeWriting = k;
      $(".write-output").hidden = false;
    }
    if (results.get(k)?.state === "done" || results.get(k)?.state === "loading") {
      render();
      return;
    }
    const result = { text: "", state: "loading", mode, instruction, language: language.value };
    results.set(k, result);
    render();
    const g = generation, id = crypto.randomUUID();
    if (!hasKey) {
      result.state = "error";
      result.error = hasVault ? "Key 已锁定，请打开设置并输入本机解锁密码。" : "首次使用，请打开设置并填写 API Key。";
      render();
      return;
    }
    try {
      const port = chrome.runtime.connect({ name: "lingo-task" });
      result.port = port;
      const finish = () => {
        clearTimeout(result.timer);
        result.port = void 0;
        port.disconnect();
      };
      const watchdog = () => {
        clearTimeout(result.timer);
        result.timer = setTimeout(() => {
          if (result.state === "loading") {
            result.state = "error";
            result.error = "连接中断或后台已休眠，请重试。";
            finish();
            render();
          }
        }, 35e3);
      };
      watchdog();
      port.onMessage.addListener((event) => {
        if (g !== generation || event.id !== id) return;
        watchdog();
        if (event.type === "delta") result.text += event.text;
        if (event.type === "done") {
          result.state = "done";
          finish();
        }
        if (event.type === "error") {
          result.state = "error";
          result.error = event.error;
          finish();
        }
        render();
      });
      port.onDisconnect.addListener(() => {
        clearTimeout(result.timer);
        if (g === generation && result.state === "loading") {
          result.state = "error";
          result.error = "连接已中断，请重试。";
          render();
        }
      });
      port.postMessage({ type: "run", task: { id, text: snap.text, mode, language: language.value, instruction } });
    } catch {
      result.state = "error";
      result.error = "扩展连接失效，请刷新页面后重试。";
      render();
    }
  }
  function cancelResult(k) {
    const r = results.get(k);
    if (r?.state === "loading") {
      r.state = "error";
      r.error = "已停止生成。";
      clearTimeout(r.timer);
      r.port?.disconnect();
      r.port = void 0;
    }
  }
  function button(label, fn, className = "") {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = className;
    b.addEventListener("click", fn);
    return b;
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      notify("已复制");
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.cssText = "position:fixed;opacity:0";
      root.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      notify(ok ? "已复制" : "复制失败，请选中结果手动复制。");
    }
  }
  function renderResult(k, prefix) {
    const r = results.get(k);
    const text = $(`.${prefix}-text`), status = $(`.${prefix}-status`), actions = $(`.${prefix}-actions`);
    actions.replaceChildren();
    text.textContent = r?.text || "";
    text.classList.toggle("loading", r?.state === "loading" && !r.text);
    status.classList.toggle("error", r?.state === "error");
    status.textContent = !r ? "" : r.state === "loading" ? "正在生成…" : r.state === "error" ? r.error || "生成失败" : r.mode === "proofread" && r.text.trim() === snap?.text.trim() ? "未发现需要修改的问题。" : "";
    if (!r) return;
    if (r.state === "loading") actions.append(button("停止", () => {
      cancelResult(k);
      render();
    }));
    if (r.state === "error") {
      actions.append(button("重试", () => {
        void config().then(() => {
          if (r.mode === "translate") language.value = r.language;
          start(r.mode, r.instruction);
        });
      }));
      actions.append(button("打开设置", () => {
        void chrome.runtime.sendMessage({ type: "options" }).catch(() => notify("扩展已更新，请刷新网页后使用。"));
      }));
    }
    if (r.state === "done") {
      actions.append(button("复制", () => {
        void copy(r.text);
      }));
      if (snap && snap.kind !== "read") {
        const replace = button("替换选中文字", () => {
          try {
            replaceSelection(snap, r.text);
            notify("已替换 · 可在编辑框按 ⌘Z / Ctrl+Z 撤销");
          } catch (e) {
            notify(e.message);
          }
          render();
        }, "primary");
        replace.disabled = !canReplace(snap);
        replace.title = replace.disabled ? "原文已变化，请重新划选；仍可复制结果" : "只替换最初选中的部分";
        actions.append(replace);
      }
    }
  }
  function render() {
    renderResult(activeTranslation, "translate");
    renderResult(activeWriting, "write");
    $(".write-label").textContent = selectedMode === "custom" ? "按你的要求修改" : `${MODES[selectedMode]}结果`;
    panel2.querySelectorAll("[data-mode]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.mode === selectedMode && !!activeWriting);
      b.setAttribute("aria-pressed", String(b.dataset.mode === selectedMode && !!activeWriting));
    });
  }
  launcher.addEventListener("pointerdown", (e) => e.preventDefault());
  launcher.addEventListener("click", () => {
    void config().then(() => {
      if (candidate && !blocked()) show(candidate);
    });
  });
  panel2.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });
  panel2.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b?.dataset.action === "close") {
      close();
      options.onClose?.();
    }
    if (b?.dataset.action === "reset-layout") resetLayout();
    if (b?.dataset.action === "settings") void chrome.runtime.sendMessage({ type: "options" }).catch(() => notify("扩展已更新，请刷新网页后使用。"));
    if (b?.dataset.mode) start(b.dataset.mode);
  });
  language.addEventListener("change", () => start("translate"));
  $(".custom").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $(".custom input");
    if (input.value.trim()) start("custom", input.value.trim());
  });
  if (!docked) {
    document.addEventListener("pointerdown", (e) => {
      if (e.composedPath().includes(host)) return;
      lastPointer = { x: e.clientX, y: e.clientY };
      if (!panel2.hidden) close();
    }, true);
    document.addEventListener("pointerup", (e) => {
      if (!e.composedPath().includes(host)) setTimeout(scan, 0);
    }, true);
    document.addEventListener("keyup", (e) => {
      if (!e.composedPath().includes(host) && e.key !== "Escape") setTimeout(scan, 0);
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && (!panel2.hidden || !launcher.hidden)) {
        close();
        e.stopPropagation();
      }
    }, true);
    document.addEventListener("compositionstart", () => {
      composing = true;
      launcher.hidden = true;
    }, true);
    document.addEventListener("compositionend", () => {
      composing = false;
    }, true);
    document.addEventListener("input", (e) => {
      if (!e.composedPath().includes(host) && !panel2.hidden) {
        if (snap?.target) snap.stale = true;
        render();
      }
    }, true);
    document.addEventListener("scroll", (e) => {
      if (!e.composedPath().includes(host)) launcher.hidden = true;
    }, true);
    window.addEventListener("resize", () => {
      launcher.hidden = true;
      if (!panel2.hidden && snap) position(panel2, snap.rect);
    });
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg.type === "refreshConfig") {
        void config();
        return;
      }
      if (msg.type === "open") {
        void config().then(() => {
          if (blocked()) {
            reply({ ok: false, error: "此站点已暂停，请从 Lingo 菜单重新启用。" });
            return;
          }
          if (sensitiveFieldActive()) {
            reply({ ok: false, error: "请先在非密码区域选中文字。" });
            return;
          }
          const s = capture() || candidate || (msg.fallback ? { text: String(msg.fallback), kind: "read", rect: new DOMRect(30, 50, 0, 20) } : null);
          if (!s || !s.text.trim() || s.text.length > MAX_TEXT) {
            reply({ ok: false, error: "请先选中 1–16,000 个字符，再打开 Lingo。" });
            return;
          }
          show(s);
          reply({ ok: true });
        });
        return true;
      }
    });
  }
  if (docked) {
    for (const attr of ["tabindex", "aria-label", "title"]) $(".drag-handle").removeAttribute(attr);
    mount();
    close();
    $('[data-action="reset-layout"]').setAttribute("title", "清除");
    $('[data-action="reset-layout"]').setAttribute("aria-label", "清除");
  }
  return { clear: close, refresh: config, showText: async (text) => {
    await config();
    show({ text, kind: "read", rect: new DOMRect() });
  } };
}
const panel = createPanel({ container: document.getElementById("panel"), onClose: () => window.close() });
let windowId = 0, sourceTabId = -1, lastSelection = "", inboxQueue = Promise.resolve();
async function receive() {
  const item = await chrome.runtime.sendMessage({ type: "panelSelection", windowId });
  if (!item?.id || item.id === lastSelection) return;
  lastSelection = item.id;
  sourceTabId = item.tabId;
  await panel.showText(item.text);
}
function receiveNext() {
  inboxQueue = inboxQueue.catch(() => {
  }).then(receive);
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes["panel:" + windowId]?.newValue) receiveNext();
  if (area === "local" && (changes.settings || changes.activeServiceId || changes.serviceProfiles)) void panel.refresh();
});
chrome.tabs.onUpdated.addListener((id, c) => {
  if (id === sourceTabId && c.status === "loading") panel.clear();
});
chrome.tabs.onRemoved.addListener((id) => {
  if (id === sourceTabId) panel.clear();
});
chrome.tabs.onActivated.addListener((info) => {
  if (info.windowId === windowId) panel.clear();
});
void chrome.windows.getCurrent().then((w) => {
  windowId = w.id;
  receiveNext();
});
window.addEventListener("pagehide", () => panel.clear());
