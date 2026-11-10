import { localize, setLanguage, resolveLanguage, t } from './i18n';
import { DEFAULTS, MODES, MAX_TEXT, type Mode, type Settings } from './core';
import { capture, canReplace, snapshotCurrent, replaceSelection, sensitiveFieldActive, type Snapshot } from './selection';
import css from './overlay.css?inline';
import { resizeBounds, type Edge } from './layout';
import { diffText, type TextDiff } from './diff';
import { createPresetPicker } from './preset-controls';
import type { RewritePreset } from './presets';
import { parseLookup, validateLookupText, type WordLookup } from './lookup';
import { createShortcutGuard, plainKey } from './shortcuts';

export function createPanel(options:{container?:HTMLElement;onClose?:()=>void}={}) {
  const docked=!!options.container;
  const host = document.createElement('div'); host.id = 'lingo-extension-root';
  host.style.cssText = docked ? 'display:block;height:100%;color-scheme:light' : 'all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important;color-scheme:light!important';
  const root = host.attachShadow({ mode: 'open' }); localize(root);
  // Webpages can reach this open shadow root. Only real user gestures may
  // operate its controls; requestSubmit() can emit a trusted submit event,
  // so forms never dispatch tasks themselves. Click/keyboard handlers do.
  for(const type of ['click','change','submit'])root.addEventListener(type,event=>{
    if(type==='submit'||!event.isTrusted&&(type==='click'||(event.target as Element).matches('.language'))){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  const shortcutGuard=createShortcutGuard(root);
  const style = document.createElement('style'); style.textContent = css + (docked ? '.panel{position:relative;inset:auto!important;width:100%;height:100%;min-width:0;min-height:0;max-width:none;max-height:none;border:0;border-radius:0;box-shadow:none}.drag-handle{cursor:default}.model{max-width:45%}.result{max-height:none}.panel .source[hidden]{display:none!important}' : ''); root.append(style);
  const launcher = document.createElement('button'); launcher.className = 'launcher'; launcher.textContent = '文'; launcher.title = 'Lingo · 翻译与修改'; launcher.setAttribute('aria-label', '用 Lingo 翻译选中文字'); launcher.hidden = true; root.append(launcher);
  const panel = document.createElement('section'); panel.className = 'panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Lingo 翻译与写作'); root.append(panel);
  // Constant markup only. Selected text and model output are always assigned using textContent.
  panel.innerHTML = `<header class="drag-handle" tabindex="0" role="group" aria-label="移动浮窗：拖动标题栏，或聚焦后用方向键移动" title="拖动标题栏移动浮窗"><div class="brand"><span class="logo">文</span><div><strong>Lingo</strong><small>读懂，也写得更好</small></div></div><div class="header-actions"><button data-action="reset-layout" class="icon" title="恢复默认位置和大小" aria-label="恢复默认位置和大小">↺</button><button data-action="settings" class="icon" title="打开设置" aria-label="打开设置">⚙</button><button data-action="close" class="icon" title="关闭 · Esc" aria-label="关闭">×</button></div></header>
    <div class="body"><details class="source"><summary>选中的原文 <span class="count"></span></summary><div class="source-text" translate="no" dir="auto"></div></details>
    <div class="tool-tabs" role="group" aria-label="工具模式"><button type="button" data-tool="writing" aria-pressed="true">写作工具</button><button type="button" data-tool="lookup" aria-pressed="false">单词与短语</button></div>
    <section class="translation"><div class="section-title"><span class="eyebrow">翻译</span><select aria-label="翻译目标语言" class="language"></select></div><div class="result translate-text" translate="no" dir="auto"></div><div class="result-status translate-status" role="status" aria-live="polite"></div><div class="result-actions translate-actions"></div></section>
    <section class="writing"><div class="section-title"><span class="eyebrow">改写</span><span class="hint">从原文开始</span></div><div class="presets"></div><div class="user-presets"></div><form class="custom"><input aria-label="自定义修改要求" maxlength="1000" placeholder="试试：更委婉一点…"><button type="button" aria-label="执行自定义改写">↗</button></form><div class="write-output" hidden><div class="write-heading"><div class="write-views" role="group" aria-label="写作结果视图"><button type="button" data-view="result" aria-pressed="true">结果</button><button type="button" data-view="compare" aria-pressed="false" disabled>对比</button></div></div><label class="diff-baseline" hidden>对比基准 <select aria-label="对比基准"><option value="previous">调整前</option><option value="original">最初原文</option></select></label><div class="diff-legend" hidden><span class="diff-delete">删除</span><span class="diff-insert">增加</span></div><div class="result write-diff" translate="no" dir="auto" hidden></div><div class="diff-status" role="status" hidden></div><div class="result write-text" translate="no" dir="auto"></div><div class="result-status write-status" role="status" aria-live="polite"></div><div class="result-actions write-actions"></div></div></section>
    <section class="lookup" hidden><p class="lookup-hint">了解词性、含义和使用场景。释义跟随界面语言。</p><div class="lookup-content"></div><div class="result-status lookup-status" role="status" aria-live="polite"></div><div class="result-actions lookup-actions"></div></section></div>
    <footer><span class="notice" role="status">仅发送选中文字</span><span class="model" translate="no"></span></footer>`;
  const $ = <T extends Element = HTMLElement>(s: string) => panel.querySelector<T>(s)!;
  const language = $<HTMLSelectElement>('.language');
  type Conversation = {parent:HTMLElement; drawer:HTMLElement; scroller:HTMLElement; list:HTMLElement; heading:HTMLElement; live:HTMLElement; actions:HTMLElement; owner?:Result; version?:ResultVersion; pending?:Result; signature?:string};
  const conversations = new Map<'translate'|'write',Conversation>();
  for (const prefix of ['translate','write'] as const) {
    const parent = $(prefix === 'write' ? '.write-output' : '.translation');
    const drawer = document.createElement('section'); drawer.className = `${prefix}-drawer refinement-drawer`; drawer.id = `${prefix}-refinement`; drawer.hidden = true; drawer.setAttribute('aria-label','调整对话');
    const heading = document.createElement('div'); heading.className = 'conversation-heading';
    const count = document.createElement('span'); count.className = 'conversation-title'; count.textContent='继续调整'; heading.append(count);
    const collapse = document.createElement('button'); collapse.type='button'; collapse.className='collapse-conversation'; collapse.textContent='收起对话'; heading.append(collapse);
    const scroller = document.createElement('div'); scroller.className='conversation-scroll'; scroller.tabIndex=0; scroller.setAttribute('aria-label','调整对话');
    const list = document.createElement('div'); list.className = `${prefix}-conversation conversation`; list.setAttribute('role','list'); list.setAttribute('aria-label','调整对话'); list.hidden=true;
    const live = document.createElement('div'); live.className = `${prefix}-live turn-live`;
    const selectors = prefix === 'write' ? ['.diff-baseline','.diff-legend','.write-diff','.diff-status','.write-text','.write-status','.write-actions'] : ['.translate-text','.translate-status','.translate-actions'];
    for (const selector of selectors) live.append($(selector));
    const actions=document.createElement('div');actions.className='conversation-actions';
    scroller.append(list); drawer.append(heading,scroller,actions); parent.append(live,drawer);
    conversations.set(prefix,{parent,drawer,scroller,list,heading,live,actions});
    new ResizeObserver(()=>sizeConversation(prefix)).observe(scroller);
    collapse.addEventListener('click', () => closeRefinement(prefix));
    collapse.title='Esc 收起，保留草稿';collapse.setAttribute('aria-keyshortcuts','Escape');
    const controls = document.createElement('div'); controls.className = `${prefix}-followup result-followup`; controls.hidden = true;
    controls.innerHTML = `<form class="refine-form" hidden><label><textarea rows="2" maxlength="1000" aria-label="继续调整要求" placeholder="还想怎么改？"></textarea></label><div class="refine-footer"><span class="refine-hint" hidden></span><button type="button" class="refine-submit">发送要求</button></div></form>`;
    drawer.append(controls);
    controls.querySelector('.refine-submit')!.setAttribute('aria-keyshortcuts','Enter');
    controls.querySelector('textarea')!.setAttribute('aria-keyshortcuts','Enter Shift+Enter');
    controls.querySelector('.refine-submit')!.addEventListener('click', () => { if(!shortcutGuard.ready())return;startRefinement(prefix === 'write' ? activeWriting : activeTranslation); });
    controls.querySelector('textarea')!.addEventListener('keydown',e=>{
      if(e.key!=='Enter'||!plainKey(e)||!shortcutGuard.accepts(e))return;
      shortcutGuard.consume(e);if(!e.repeat)startRefinement(prefix==='write'?activeWriting:activeTranslation);
    });
    controls.querySelector('textarea')!.addEventListener('input', () => {
      const r = results.get(prefix === 'write' ? activeWriting : activeTranslation); if (!r) return;
      r.refineDraft = controls.querySelector('textarea')!.value;
      updateRefineSubmit(r, controls);
    });
  }
  const writingControls=document.createElement('div');writingControls.className='writing-controls';
  for(const selector of ['.writing > .section-title','.presets','.user-presets','.custom'])writingControls.append($(selector));
  const writingSummary=document.createElement('div');writingSummary.className='writing-mode-summary';writingSummary.hidden=true;
  const modeLabel=document.createElement('span');modeLabel.className='writing-mode-label';
  const changeMode=document.createElement('button');changeMode.type='button';changeMode.textContent='更换方式';changeMode.setAttribute('aria-expanded','false');
  writingControls.id='lingo-writing-controls';changeMode.setAttribute('aria-controls',writingControls.id);
  writingSummary.append(modeLabel,changeMode);$('.writing').prepend(writingSummary,writingControls);
  changeMode.addEventListener('click',()=>{const r=results.get(activeWriting);if(r){r.controlsOpen=!r.controlsOpen;render();}});
  const sourceEditor=document.createElement('textarea');
  if(sourceEditor){
    sourceEditor.className='source-editor';sourceEditor.rows=docked?5:3;sourceEditor.setAttribute('aria-label','编辑原文');sourceEditor.placeholder='在此粘贴或修改原文…';sourceEditor.dir='auto';
    $('.source summary').firstChild!.textContent='原文 ';$('.source-text').setAttribute('hidden','');$('.source').append(sourceEditor);
    const actions=document.createElement('div');actions.className='source-actions';const submit=document.createElement('button');submit.type='button';submit.className='source-submit';submit.textContent='翻译';actions.append(submit);$('.source').append(actions);
    const submitSource=()=>{const text=sourceEditor.value;if(!text.trim()||text.length>MAX_TEXT)return;start(toolView === 'lookup' ? 'lookup' : 'translate');};
    submit.addEventListener('click',submitSource);
    sourceEditor.title='⌘/Ctrl+Enter 执行当前工具';sourceEditor.setAttribute('aria-keyshortcuts','Control+Enter Meta+Enter');submit.title='⌘/Ctrl+Enter 执行当前工具';
    sourceEditor.addEventListener('keydown',e=>{
      if(e.key!=='Enter'||!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey||!shortcutGuard.accepts(e))return;
      shortcutGuard.consume(e);if(!e.repeat&&!submit.disabled)submitSource();
    });
    sourceEditor.addEventListener('input',()=>{
      resultFocus=null;generation++;stopAll();if(docked){snap?.cleanup?.();snap=null;}activeLookup=activeWriting=activeTranslation='';writeView='result';render();$('.write-output').hidden=true;
      $('.source-text').textContent=sourceEditor.value;$('.count').textContent=`${sourceEditor.value.length} 字符`;
      renderTool();
      notifySource();
      $('.translate-status').textContent=sourceEditor.value.length>MAX_TEXT?'选中文字过长，请缩短到 16,000 个字符以内。':'点击翻译或选择写作工具，更新结果。';
    });
  }

  const edges: Edge[] = docked ? [] : ['n','s','e','w','ne','nw','se','sw'];
  const edgeNames = { n: '上边', s: '下边', e: '右边', w: '左边', ne: '右上角', nw: '左上角', se: '右下角', sw: '左下角' };
  for (const edge of edges) {
    const handle = document.createElement('button'); handle.className = 'resize-handle'; handle.dataset.edge = edge;
    handle.setAttribute('aria-label', `调整浮窗大小：${edgeNames[edge]}`); handle.tabIndex = edge === 'se' ? 0 : -1; panel.append(handle);
  }
  const modes: Mode[] = ['proofread','natural','professional','friendly','concise','precise'];
  modes.forEach(mode => { const b = document.createElement('button'); b.textContent = MODES[mode]; b.dataset.mode = mode; $('.presets').append(b); });
  let profileId = '';
  let settings: Settings = { ...DEFAULTS }, hasKey = false, hasVault = false, snap: Snapshot | null = null;
  let candidate: Snapshot | null = null, generation = 0, selectedMode: Mode = 'proofread';
  let composing = false, lastPointer = { x: 30, y: 60 }, activeWriting = '', activeTranslation = '', activeLookup = '';
  let toolView: 'writing' | 'lookup' = 'writing';
  let writeView: 'result' | 'compare' = 'result';
  let resultFocus:'write'|null=null;
  let writingToReveal='';
  const MAX_VERSIONS = 20;
  type ResultVersion = { source: string; text: string; instruction: string; parent: number | null; diff?: TextDiff; originalDiff?: TextDiff };
  const staleMessage = '原文已变化或选区已失效，请重新划选。';
  type Result = { versions?: ResultVersion[]; versionIndex?: number; pending?: Result; baseVersion?: number; refineDraft?: string; refineOpen?: boolean; controlsOpen?:boolean; lookup?: WordLookup; preset?: RewritePreset; source: string; text: string; state: 'loading' | 'done' | 'error'; error?: string; mode: Mode; instruction: string; language: string; port?: chrome.runtime.Port; timer?: ReturnType<typeof setTimeout> };
  const results = new Map<string, Result>();
  $('.writing-controls .section-title .hint').remove();
  const managePresets=document.createElement('button');managePresets.type='button';managePresets.className='manage-presets';managePresets.textContent='管理预设';
  $('.writing-controls .section-title').append(managePresets);
  managePresets.addEventListener('click',()=>void chrome.runtime.sendMessage({type:'options',section:'presets'}).then(r=>{if(r?.error)notify(r.error);}).catch(()=>notify('扩展已更新，请刷新网页后使用。')));
  const presetControls = createPresetPicker($('.user-presets'), {
    choices:$('.presets'),
    run: preset => start('custom',preset.instruction,preset),
    changed: items => {
      for (const [k,r] of results) if (r.preset && !items.some(p=>p.id===r.preset!.id && p.name===r.preset!.name && p.instruction===r.instruction)) {
        cancelResult(k);results.delete(k);
        if (activeWriting===k) {activeWriting='';$('.write-output').hidden=true;}
      }
      render();
    }
  });
  async function config() {
    try { const c = await chrome.runtime.sendMessage({ type: 'config' }); if (c?.settings) { const serviceChanged = profileId !== c.profileId || settings.baseUrl !== c.settings.baseUrl || settings.model !== c.settings.model; profileId=c.profileId;
      const localeChanged = resolveLanguage(settings.uiLanguage) !== resolveLanguage(c.settings.uiLanguage);
      settings = c.settings; setLanguage(settings.uiLanguage);
      if (localeChanged) { for (const [k,r] of results) if (r.mode === 'lookup') { cancelResult(k); results.delete(k); } activeLookup=''; render(); }
       if (serviceChanged && !panel.hidden) close(); hasKey = c.hasKey; hasVault = c.hasVault; } }
    catch { notify('扩展已更新，请刷新网页后使用。'); }
    language.replaceChildren(...settings.languages.map(l => { const o = document.createElement('option'); o.value = l; o.textContent = l.split('（')[0]; o.translate = false; return o; }));
    language.value = settings.language; $('.model').textContent = new URL(settings.baseUrl).host + ' · ' + settings.model; $('.model').setAttribute('title', settings.baseUrl + '/responses');
    if (settings.blockedHosts.includes(location.hostname)) close();
  }
  void config();
  function mount() { if (!host.isConnected) (options.container || document.documentElement).append(host); }
  function blocked() { return settings.blockedHosts.includes(location.hostname); }
  function notify(text: string) { $('.notice').textContent = text; }
  function notifySource() { notify(toolView === 'lookup' || docked || !snap || snap.kind === 'read' ? '仅发送当前原文 · 此处可复制结果' : '仅发送当前原文 · 可替换最初选区'); }
  // Layout belongs to this page session, never to the selected text or API request.
  let moved = false;
  type Gesture = { id: number; kind: 'move' | Edge; x: number; y: number; left: number; top: number; width: number; height: number };
  let gesture: Gesture | null = null;
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, Math.max(min, max)));
  function fitPanel() {
    if (panel.hidden || docked) return;
    const r = panel.getBoundingClientRect();
    panel.style.left = `${clamp(r.left, 10, innerWidth - r.width - 10)}px`;
    panel.style.top = `${clamp(r.top, 10, innerHeight - r.height - 10)}px`;
  }
  function position(el: HTMLElement, rect: DOMRect) {
    if(docked)return;
    if (el === panel && moved) { fitPanel(); return; }
    const width = el === launcher ? 34 : panel.offsetWidth;
    const height = el === launcher ? 34 : panel.offsetHeight;
    const left = clamp(rect.left || lastPointer.x, 10, innerWidth - width - 10);
    let top = rect.bottom + 9;
    if (top + height > innerHeight - 10) top = rect.top - height - 9;
    el.style.left = `${left}px`; el.style.top = `${clamp(top, 10, innerHeight - height - 10)}px`;
  }
  function resizeFrom(bounds: { left: number; top: number; width: number; height: number }, edge: Edge, dx: number, dy: number) {
    const r = resizeBounds(bounds, edge, dx, dy, { width: innerWidth, height: innerHeight });
    panel.style.left = `${r.left}px`; panel.style.top = `${r.top}px`;
    panel.style.width = `${r.width}px`; panel.style.height = `${r.height}px`;
  }
  function resetLayout() {
    if(docked){close();return;}
    moved = false; panel.style.width = ''; panel.style.height = '';
    if (snap) position(panel, snap.rect);
  }
  function layoutControl(el: HTMLElement, kind: 'move' | Edge) {
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || (kind === 'move' && (e.target as Element).closest('button'))) return;
      e.preventDefault(); e.stopPropagation();
      const r = panel.getBoundingClientRect(); moved = true;
      gesture = { id: e.pointerId, kind, x: e.clientX, y: e.clientY, left: r.left, top: r.top, width: r.width, height: r.height };
      el.setPointerCapture(e.pointerId); panel.classList.add('adjusting');
    });
    el.addEventListener('pointermove', e => {
      if (!gesture || gesture.id !== e.pointerId) return;
      const g = gesture, dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (g.kind === 'move') {
        panel.style.left = `${clamp(g.left + dx, 10, innerWidth - panel.offsetWidth - 10)}px`;
        panel.style.top = `${clamp(g.top + dy, 10, innerHeight - panel.offsetHeight - 10)}px`;
      } else resizeFrom(g, g.kind, dx, dy);
    });
    const finish = () => { gesture = null; panel.classList.remove('adjusting'); };
    el.addEventListener('pointerup', finish); el.addEventListener('pointercancel', finish); el.addEventListener('lostpointercapture', finish);
    el.addEventListener('keydown', e => {
      if (e.target !== el || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); moved = true;
      const step = e.shiftKey ? 40 : 10, r = panel.getBoundingClientRect();
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (kind !== 'move') resizeFrom(r, kind, dx, dy);
      else { panel.style.left = `${r.left + dx}px`; panel.style.top = `${r.top + dy}px`; fitPanel(); }
    });
  }
  if(!docked)layoutControl($('.drag-handle'), 'move');
  for (const edge of edges) layoutControl($(`[data-edge="${edge}"]`), edge);
  new ResizeObserver(() => { if (!panel.hidden && snap) position(panel, snap.rect); }).observe(panel);
  function stopAll() { results.forEach(r => { clearTimeout(r.timer); r.port?.disconnect(); clearTimeout(r.pending?.timer); r.pending?.port?.disconnect(); }); results.clear(); }
  function close() {
    gesture = null; panel.classList.remove('adjusting'); presetControls.reset();
    generation++; stopAll(); snap?.cleanup?.(); candidate?.cleanup?.(); snap = candidate = null; activeLookup = activeWriting = activeTranslation = ''; writeView = 'result'; render(); panel.hidden = launcher.hidden = true;
    for (const selector of ['.source-text','.translate-text','.write-text','.translate-status','.write-status','.translate-actions','.write-actions']) $(selector).replaceChildren();
    $<HTMLInputElement>('.custom input').value = ''; sourceEditor.value=''; renderTool(); renderLookup();
    if(docked){notify('仅发送当前原文 · 此处可复制结果');panel.hidden=false;$('.source').hidden=false;$<HTMLDetailsElement>('.source').open=true;sourceEditor!.value='';$<HTMLButtonElement>('.source-submit').disabled=true;$('.count').textContent='';$('.write-output').hidden=true;$('.translate-status').classList.remove('error');$('.translate-text').classList.remove('loading');$('.translate-status').textContent='在上方粘贴原文，再翻译或选择写作工具。';}
  }
  function scan(pointer?: {x:number;y:number}) {
    if (composing || blocked() || !panel.hidden || root.activeElement) return;
    candidate?.cleanup?.(); candidate = capture();
    if (!candidate || candidate.text.length > MAX_TEXT) { launcher.hidden = true; return; }
    mount(); launcher.hidden = false;
    if(pointer){
      // Use the selection's release point, rather than the top-left of a multiline range.
      const gap=8,width=launcher.offsetWidth,height=launcher.offsetHeight;
      const left=pointer.x+gap+width<=innerWidth-10?pointer.x+gap:pointer.x-gap-width;
      const top=pointer.y+gap+height<=innerHeight-10?pointer.y+gap:pointer.y-gap-height;
      launcher.style.left=`${clamp(left,10,innerWidth-width-10)}px`;
      launcher.style.top=`${clamp(top,10,innerHeight-height-10)}px`;
    }else position(launcher, candidate.rect);
  }
  function show(snapshot: Snapshot, targetLanguage=settings.language, initialMode?:'translate'|'proofread') {
    resultFocus=null;
    $('.source').hidden=false; presetControls.reset();void presetControls.refresh();
    generation++; stopAll(); snap?.cleanup?.(); if (candidate && candidate !== snapshot) candidate.cleanup?.();
    snap = snapshot; snapshot.onStale = () => { if (snap === snapshot) invalidate(); }; candidate = null; writeView = 'result'; activeLookup = activeWriting = activeTranslation = ''; selectedMode = 'proofread';
    $<HTMLInputElement>('.custom input').value = '';
    $('.write-output').hidden = true;
    $('.source-text').textContent = snapshot.text; $('.count').textContent = `${snapshot.text.length} 字符`;
    $<HTMLDetailsElement>('.source').open=true;if(sourceEditor){sourceEditor.value=snapshot.text;$<HTMLButtonElement>('.source-submit').disabled=!snapshot.text.trim()||snapshot.text.length>MAX_TEXT;}
    mount(); panel.hidden = false; launcher.hidden = true; position(panel, snapshot.rect);
    notifySource();
    language.value = targetLanguage;
    if(initialMode)toolView='writing';
    renderTool();
    start(initialMode || (toolView === 'lookup' ? 'lookup' : 'translate'));
  }
  function invalidate() {
    generation++; stopAll(); snap?.cleanup?.(); snap = null;
    activeLookup = activeWriting = activeTranslation = ''; writeView = 'result'; render();
    $('.write-output').hidden = true; $('.translate-status').textContent = staleMessage;
  }
  function current() {
    if (!snap) return false;
    if (snapshotCurrent(snap)) return true;
    invalidate(); return false;
  }
  function lookupLanguage() { return { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English' }[resolveLanguage(settings.uiLanguage)]; }
  function key(mode: Mode, instruction: string, preset?: RewritePreset) { return JSON.stringify([mode, mode === 'lookup' ? lookupLanguage() : mode === 'translate' ? language.value : '', instruction,preset?.id||'']); }
  function start(mode: Mode, instruction = '', preset?: RewritePreset) {
    if (!sourceEditor.value.trim() || sourceEditor.value.length>MAX_TEXT) return;
    if (mode === 'lookup') { try { validateLookupText(sourceEditor.value); } catch { renderLookup(); return; } }
    if (!snap && docked && sourceEditor.value.trim() && sourceEditor.value.length<=MAX_TEXT)snap={text:sourceEditor.value,kind:'read',rect:new DOMRect()};
    if (!current()) return;
    notifySource();
    const k = key(mode, instruction,preset);
    writingToReveal=mode==='translate'||mode==='lookup'?'':k;
    if (mode === 'translate') { resultFocus=null;const writing=results.get(activeWriting);if(writing)writing.refineOpen=false; if (activeTranslation !== k) cancelResult(activeTranslation); activeTranslation = k; }
    else if (mode === 'lookup') { if (activeLookup !== k) cancelResult(activeLookup); activeLookup = k; }
    else { writeView = 'result'; if (activeWriting !== k) cancelResult(activeWriting); selectedMode = mode; activeWriting = k; $('.write-output').hidden = false; }
    if (results.get(k)?.state === 'done' || results.get(k)?.state === 'loading') { render(); revealWritingResult(k); return; }
    const result: Result = { ...(preset?{preset:{...preset}}:{}), source: sourceEditor.value, text: '', state: 'loading', mode, instruction, language: mode === 'lookup' ? lookupLanguage() : language.value };
    results.set(k, result); render();
    requestResult(k, result);
  }
  function revealWritingResult(k:string) {
    const r=results.get(k),g=generation;
    if(!r || r.state!=='done' || writingToReveal!==k)return;
    requestAnimationFrame(()=>{
      if(g!==generation || panel.hidden || toolView!=='writing' || activeWriting!==k || writingToReveal!==k || results.get(k)!==r)return;
      writingToReveal='';
      // Move only Lingo's viewport; preserve the page, selection and keyboard focus.
      const body=$('.body'), output=$('.write-output');
      body.scrollTop+=output.getBoundingClientRect().top-body.getBoundingClientRect().top-12;
      if(!r.refineOpen)$('.write-text').scrollTop=0;
    });
  }
  function requestResult(k: string, result: Result, owner = result) {
    const refining = owner !== result;
    const g = generation, id = crypto.randomUUID();
    if (!hasKey) { result.state = 'error'; result.error = hasVault ? 'Key 已锁定，请打开设置并输入本机解锁密码。' : '首次使用，请打开设置并填写 API Key。'; render(); return; }
    try {
      const port = chrome.runtime.connect({ name: 'lingo-task' }); result.port = port;
      const finish = () => { clearTimeout(result.timer); result.port = undefined; port.disconnect(); };
      const watchdog = () => {
        clearTimeout(result.timer);
        result.timer = setTimeout(() => { if (result.state === 'loading') { result.state = 'error'; result.error = '连接中断或后台已休眠，请重试。'; finish(); render(); } }, 35000);
      };
      watchdog();
      port.onMessage.addListener(event => {
        if (g !== generation || event.id !== id || results.get(k) !== owner || (refining && owner.pending !== result) || result.state !== 'loading' || !current()) return;
        watchdog();
        if (event.type === 'delta') result.text += event.text;
        if (event.type === 'done') {
          try {
            if (result.mode === 'lookup') result.lookup = parseLookup(result.text);
            else if (refining) {
              owner.versions!.push({source:result.source,text:result.text,instruction:result.instruction,parent:result.baseVersion!});
              owner.versionIndex = owner.versions!.length - 1; owner.pending = undefined; owner.refineDraft = '';
              if (k === activeWriting) { writeView = 'result'; $<HTMLSelectElement>('.diff-baseline select').value = 'previous'; }
            } else { result.versions = [{source:result.source,text:result.text,instruction:result.instruction,parent:null}]; result.versionIndex = 0; }
            result.state = 'done';
          }
          catch (error) { result.state = 'error'; result.error = (error as Error).message; }
          finish();
        }
        if (event.type === 'error') { result.state = 'error'; result.error = event.error; finish(); }
        render();
        if(event.type==='done' && !refining)revealWritingResult(k);
      });
      port.onDisconnect.addListener(() => {
        clearTimeout(result.timer);
        if (g === generation && result.state === 'loading') { result.state = 'error'; result.error = '连接已中断，请重试。'; render(); }
      });
      port.postMessage({ type: 'run', task: { id, text: result.source, mode: result.mode, language: result.language, instruction: result.instruction } });
    } catch { result.state = 'error'; result.error = '扩展连接失效，请刷新页面后重试。'; render(); }
  }
  function cancelResult(k: string) {
    const owner = results.get(k);
    for (const r of [owner, owner?.pending]) if (r?.state === 'loading') { r.state = 'error'; r.error = '已停止生成。'; clearTimeout(r.timer); r.port?.disconnect(); r.port = undefined; }
  }
  function version(r: Result) { return r.versions?.at(-1); }
  function refinementLimit(r: Result) {
    if ((r.versions?.length || 0) >= MAX_VERSIONS) return '本次对话已保留 20 轮结果，可复制结果后开启新的处理。';
    if ((version(r)?.text.length || 0) > MAX_TEXT) return '当前结果超过 16,000 个字符，请复制并缩短后再处理。';
    return '';
  }
  function startRefinement(k: string, retry?: Result) {
    const owner = results.get(k), instruction = (retry?.instruction ?? owner?.refineDraft ?? '').trim();
    if (toolView !== 'writing' || (k !== activeTranslation && k !== activeWriting) || !owner || owner.state !== 'done' || owner.mode === 'lookup' || owner.pending?.state === 'loading' || !instruction || instruction.length > 1000 || refinementLimit(owner) || !current()) return;
    if (retry && (owner.pending !== retry || owner.versionIndex !== retry.baseVersion)) return;
    const base = version(owner); if (!base?.text.trim()) return;
    const pending: Result = {source:base.text,text:'',state:'loading',mode:'custom',language:owner.language,instruction,baseVersion:owner.versionIndex || 0};
    owner.pending = pending; owner.refineOpen = true; if (k === activeWriting) writeView = 'result'; render(); notify('仅发送当前版本与本次要求');
    const prefix=k===activeWriting?'write':'translate'; scrollTurn(prefix,conversations.get(prefix)!.list.querySelector('.pending-turn'));
    requestResult(k,pending,owner);
  }
  function updateRefineSubmit(r: Result, controls: Element) {
    const busy = r.pending?.state === 'loading';
    const submit = controls.querySelector<HTMLButtonElement>('.refine-submit')!;
    submit.disabled = busy || !!refinementLimit(r) || !r.refineDraft?.trim() || r.refineDraft.length > 1000;
    const input=controls.querySelector<HTMLTextAreaElement>('textarea')!;
    // Keep keyboard focus during generation so the next adjustment can be typed immediately.
    input.readOnly=busy;input.setAttribute('aria-busy',String(busy));
    const hint=controls.querySelector<HTMLElement>('.refine-hint')!;hint.textContent=refinementLimit(r);hint.hidden=!hint.textContent;
  }
  function renderRefinement(k: string, prefix: 'translate' | 'write') {
    const r = results.get(k), controls = $(`.${prefix}-followup`), input = controls.querySelector<HTMLTextAreaElement>('textarea')!;
    const v = r && version(r); controls.hidden = !v || r?.state !== 'done';
    const c=conversations.get(prefix)!; c.drawer.hidden=controls.hidden || !r?.refineOpen; c.parent.classList.toggle('refining',!c.drawer.hidden);
    const expanded=!c.drawer.hidden, actions=$(`.${prefix}-actions`), actionParent=expanded?c.actions:c.live;
    if(actions.parentElement!==actionParent)actionParent.append(actions);
    if(prefix==='write')$('.write-views').hidden=expanded;
    if (!r || !v || r.state !== 'done') { input.value = ''; return; }
    controls.querySelector<HTMLFormElement>('.refine-form')!.hidden = !r.refineOpen;
    if (input.value !== (r.refineDraft || '')) input.value = r.refineDraft || '';
    updateRefineSubmit(r,controls);
  }
  function closeRefinement(prefix:'translate'|'write') {
    const k=prefix==='write'?activeWriting:activeTranslation,r=results.get(k);if(!r||!current())return;
    r.refineOpen=false;r.controlsOpen=false;render();$<HTMLButtonElement>(`.${prefix}-actions .turn-refine`)?.focus({preventScroll:true});
  }
  // Only scroll the refinement viewport, never its enclosing panel or the webpage.
  function scrollTurn(prefix:'translate'|'write', target:Element|null) {
    if(!target)return;
    const c=conversations.get(prefix)!, bounds=c.scroller.getBoundingClientRect(), rect=target.getBoundingClientRect();
    if(rect.height>bounds.height || rect.top<bounds.top)c.scroller.scrollTop+=rect.top-bounds.top;
    else if(rect.bottom>bounds.bottom)c.scroller.scrollTop+=rect.bottom-bounds.bottom;
  }
  function sizeConversation(prefix:'translate'|'write') {
    const c=conversations.get(prefix)!,body=c.scroller,target=c.list.lastElementChild;
    if(!body.clientHeight)return;
    const style=getComputedStyle(body),top=parseFloat(style.paddingTop)||0,bottom=parseFloat(style.paddingBottom)||0;
    const aligned=!!target && Math.abs(target.getBoundingClientRect().top-body.getBoundingClientRect().top-top)<2;
    c.list.style.setProperty('--conversation-page-height',`${Math.max(0,body.clientHeight-top-bottom)}px`);
    if(aligned)alignLatest(prefix);
  }
  function alignLatest(prefix:'translate'|'write') {
    const c=conversations.get(prefix)!,body=c.scroller,target=c.list.lastElementChild;
    if(!target || !body.clientHeight)return;
    body.scrollTop+=target.getBoundingClientRect().top-body.getBoundingClientRect().top-(parseFloat(getComputedStyle(body).paddingTop)||0);
  }
  function renderConversation(k:string,prefix:'translate'|'write', scrollTop:number) {
    const r=results.get(k), c=conversations.get(prefix)!, body=c.scroller, v=r&&version(r);
    const ready=r?.state==='done' && !!v;
    c.list.hidden=!ready;
    // Keep one result component, moving it between the compact view and the drawer.
    if(!ready || !r.refineOpen){
      if(c.live.parentElement!==c.parent)c.parent.insertBefore(c.live,c.drawer);
      c.list.replaceChildren();
      if(!ready || c.owner!==r){c.owner=undefined;c.version=undefined;c.pending=undefined;}
      c.signature='';return;
    }
    const index=r.versions!.length-1,busy=r.pending?.state==='loading';
    const signature=JSON.stringify([index,r.pending?.state,r.pending?.error]);
    if(c.owner===r && c.signature===signature)return;
    const sameVersion=c.owner===r && c.version===v;
    const revealLatest=!sameVersion || !c.signature || busy&&c.pending!==r.pending;
    c.parent.insertBefore(c.live,c.drawer);c.list.replaceChildren();
    const node=(tag:string,text:string,cls:string,literal=false)=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;if(literal){e.translate=false;e.dir='auto';}return e;};
    const request=(instruction:string)=>{const message=node('div','','turn-request');message.append(node('p',instruction,'turn-instruction',true));return message;};
    r.versions!.forEach((entry,i)=>{
      const turn=node('article','','conversation-turn');turn.dataset.version=String(i);turn.setAttribute('role','listitem');turn.classList.toggle('selected-turn',i===index);
      if(entry.parent!==null)turn.append(request(entry.instruction));
      const answer=node('div','','turn-answer');
      answer.append(i===index?c.live:node('div',entry.text,'turn-text',true));
      turn.append(answer);c.list.append(turn);
    });
    if(r.pending){
      const pending=r.pending, pendingTurn=node('article','','conversation-turn pending-turn');pendingTurn.setAttribute('role','listitem');
      pendingTurn.append(request(pending.instruction));
      const status=node('div',busy?'正在继续调整，当前版本已保留…':`${t(pending.error || '生成失败')} ${t('仍保留调整前的完整结果。')}`,'pending-status result-status'+(busy?'':' error'));
      status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      const actions=node('div','','pending-actions result-actions');
      if(busy)actions.append(button('停止',()=>{cancelResult(k);render();}));
      else actions.append(button('重试调整',()=>{const g=generation;void config().then(()=>{if(g===generation)startRefinement(k,pending);});}));
      pendingTurn.append(status,actions);c.list.append(pendingTurn);
    }
    c.owner=r;c.version=v;c.pending=r.pending;c.signature=signature;
    sizeConversation(prefix);body.scrollTop=sameVersion?scrollTop:0;
    if(revealLatest){
      const g=generation;
      requestAnimationFrame(()=>{if(g===generation && c.owner===r && r.refineOpen && !c.drawer.hidden){sizeConversation(prefix);alignLatest(prefix);}});
    }
  }
  function button(label: string, fn: () => void, className = '') {
    const b = document.createElement('button'); b.textContent = label; b.className = className;
    b.addEventListener('click', fn); return b;
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); notify('已复制'); }
    catch {
      const area = document.createElement('textarea'); area.value = text; area.style.cssText = 'position:fixed;opacity:0'; root.append(area); area.select();
      const ok = document.execCommand('copy'); area.remove(); notify(ok ? '已复制' : '复制失败，请选中结果手动复制。');
    }
  }
  function renderResult(k: string, prefix: 'translate' | 'write') {
    const r = results.get(k); const text = $(`.${prefix}-text`), status = $(`.${prefix}-status`), actions = $(`.${prefix}-actions`);
    const scroll = conversations.get(prefix)!.scroller.scrollTop;
    const visibleText = r ? version(r)?.text ?? r.text : '';
    renderRefinement(k,prefix);
    actions.replaceChildren(); if (text.textContent !== visibleText) text.textContent = visibleText; text.classList.toggle('loading', r?.state === 'loading' && !r.text);
    status.classList.toggle('error', r?.state === 'error');
    status.textContent = !r ? '' : r.state === 'loading' ? '正在生成…' : r.state === 'error' ? r.error || '生成失败' : r.mode === 'proofread' && !r.versionIndex && visibleText === r.source ? '未发现需要修改的问题。' : '';
    if (!r) { renderConversation(k,prefix,scroll); return; }
    if (r.state === 'loading') actions.append(button('停止', () => { cancelResult(k); render(); }));
    if (r.state === 'error') {
      actions.append(button('重试', () => { const g = generation; void config().then(() => { if (g !== generation || !current()) return; if (r.mode === 'translate') language.value = r.language; start(r.mode, r.instruction,r.preset); }); }));
      actions.append(button('打开设置', () => { void chrome.runtime.sendMessage({ type: 'options' }).catch(()=>notify('扩展已更新，请刷新网页后使用。')); }));
    }
    if (r.state === 'done') {
      const busy = r.pending?.state === 'loading';
      const copyButton = button('复制', () => { if (current()) void copy(visibleText); }); copyButton.disabled = busy; actions.append(copyButton);
      if (snap && snap.kind !== 'read') {
        const replace = button('替换选中文字', () => {
          if (!current()) return;
          try { replaceSelection(snap!, visibleText); notify('已替换 · 可在编辑框按 ⌘Z / Ctrl+Z 撤销'); }
          catch (e) { notify((e as Error).message); }
          render();
        }, 'primary');
        replace.disabled = busy || !canReplace(snap); replace.title = busy ? '正在继续调整，当前版本已保留…' : replace.disabled ? '原文已变化，请重新划选；仍可复制结果' : '只替换最初选中的部分'; actions.append(replace);
      }
      const refine = button('继续调整', () => {
        if (!current()) return;
        r.refineOpen = true;resultFocus=prefix==='write'?'write':null;r.controlsOpen=false;const other=results.get(prefix==='write'?activeTranslation:activeWriting);if(other)other.refineOpen=false;r.controlsOpen=false;render();notify('仅发送当前版本与本次要求');
        if (r.refineOpen) { $<HTMLTextAreaElement>(`.${prefix}-followup textarea`).focus({preventScroll:true}); conversations.get(prefix)!.drawer.scrollIntoView({block:'nearest'}); }
      }, 'turn-refine'); refine.setAttribute('aria-expanded',String(!!r.refineOpen)); refine.setAttribute('aria-controls',`${prefix}-refinement`);if(prefix==='write'&&!r.refineOpen)actions.append(refine);
      if(r.pending && !r.refineOpen){
        const pending=r.pending;status.textContent=busy?'正在继续调整，当前版本已保留…':`${t(pending.error || '生成失败')} ${t('仍保留调整前的完整结果。')}`;status.classList.toggle('error',!busy);
        actions.append(busy?button('停止',()=>{cancelResult(k);render();}):button('重试调整',()=>{const g=generation;void config().then(()=>{if(g===generation)startRefinement(k,pending);});}));
      }
    }
    renderConversation(k,prefix,scroll);
  }
  function renderTool() {
    const lookup = toolView === 'lookup';
    $('.translation').hidden = $('.writing').hidden = lookup; $('.lookup').hidden = !lookup;
    for (const view of ['writing','lookup']) $(`[data-tool=${view}]`).setAttribute('aria-pressed', String(toolView === view));
    const submit = $<HTMLButtonElement>('.source-submit'); submit.textContent = lookup ? '查看词语' : '翻译';
    submit.disabled = !sourceEditor.value.trim() || sourceEditor.value.length > MAX_TEXT;
    if (lookup) { try { validateLookupText(sourceEditor.value); } catch { submit.disabled = true; } if (!docked && !snap) submit.disabled = true; }
  }
  function renderLookup() {
    const r = results.get(activeLookup), content = $('.lookup-content'), status = $('.lookup-status'), actions = $('.lookup-actions');
    content.replaceChildren(); actions.replaceChildren(); status.classList.toggle('error', r?.state === 'error');
    status.textContent = !r ? '选择一个单词或短语，点击「查看词语」。' : r.state === 'loading' ? '正在解释词语…' : r.state === 'error' ? r.error || '生成失败' : '';
    if (!r) {
      if (!docked && !snap && sourceEditor.value.trim()) { status.textContent = staleMessage; status.classList.add('error'); return; }
      if (sourceEditor.value.trim()) { try { validateLookupText(sourceEditor.value); } catch (e) { status.textContent = (e as Error).message; status.classList.add('error'); } }
      return;
    }
    if (r.state === 'loading') actions.append(button('停止', () => { cancelResult(activeLookup); renderLookup(); }));
    if (r.state === 'error') {
      actions.append(button('重试', () => { const g = generation; void config().then(() => { if (g === generation && toolView === 'lookup') start('lookup'); }); }));
      actions.append(button('打开设置', () => { void chrome.runtime.sendMessage({type:'options'}).catch(() => notify('扩展已更新，请刷新网页后使用。')); }));
    }
    if (r.state !== 'done' || !r.lookup) return;
    const data = r.lookup, kind = {word:'单词',phrase:'短语',other:'词语说明'}[data.kind];
    const element = (tag: string, text: string, className: string, literal = false) => {
      const el = document.createElement(tag); el.textContent = text; el.className = className;
      if (literal) { el.translate = false; el.dir = 'auto'; } return el;
    };
    const heading = element('div', '', 'lookup-heading');
    heading.append(element('h2',r.source.trim(),'lookup-term',true), element('span',kind,'lookup-kind')); content.append(heading);
    const copied = [r.source.trim()];
    for (const sense of data.senses) {
      const card = element('section','','lookup-sense');
      card.append(element('div',sense.partOfSpeech,'lookup-pos',true), element('p',sense.meaning,'lookup-meaning',true), element('h3','何时使用','lookup-label'), element('p',sense.usage,'lookup-usage',true));
      copied.push(sense.partOfSpeech, sense.meaning, `${t('何时使用')}: ${sense.usage}`);
      if (sense.collocations.length) {
        card.append(element('h3','常见搭配','lookup-label'));
        const list = element('ul','','lookup-collocations');
        for (const collocation of sense.collocations) list.append(element('li',collocation,'',true));
        card.append(list); copied.push(`${t('常见搭配')}: ${sense.collocations.join(' · ')}`);
      }
      card.append(element('h3','例句','lookup-label'));
      for (const example of sense.examples) {
        const item = element('div','','lookup-example');
        item.append(element('p',example.text,'example-text',true),element('p',example.translation,'example-translation',true)); card.append(item);
        copied.push(example.text,example.translation);
      }
      content.append(card);
    }
    if (data.note) { content.append(element('p',data.note,'lookup-note',true)); copied.push(data.note); }
    actions.append(button('复制词语说明', () => { if (current()) void copy(copied.join('\n\n')); }));
  }
  function renderComparison() {
    const r = results.get(activeWriting), ready = r?.state === 'done' && r.pending?.state !== 'loading';
    const v = r && version(r);
    if (!ready || r?.refineOpen) writeView = 'result';
    const compare = ready && writeView === 'compare';
    $<HTMLButtonElement>('[data-view=compare]').disabled = !ready;
    for (const view of ['result','compare']) $(`[data-view=${view}]`).setAttribute('aria-pressed', String(writeView === view));
    $('.write-text').hidden = compare; $('.write-diff').hidden = !compare;
    $('.diff-legend').hidden = !compare; $('.diff-status').hidden = !compare;
    $('.write-diff').replaceChildren(); $('.diff-status').textContent = '';
    $('.diff-baseline').hidden = !compare || !v || v.parent === null;
    if (!compare || !r || !v) return;
    const original = $<HTMLSelectElement>('.diff-baseline select').value === 'original';
    const baseline = original ? r.source : v.source;
    const diff = original ? (v.originalDiff ??= diffText(baseline,v.text)) : (v.diff ??= diffText(baseline,v.text));
    const fragment = document.createDocumentFragment();
    for (const part of diff.parts) {
      if (part.kind === 'equal') fragment.append(document.createTextNode(part.text));
      else {
        const mark = document.createElement(part.kind === 'delete' ? 'del' : 'ins');
        mark.className = `diff-${part.kind}`; mark.textContent = part.text; fragment.append(mark);
      }
    }
    $('.write-diff').append(fragment);
    const unchanged = baseline === v.text;
    $('.diff-legend').hidden = unchanged;
    $('.diff-status').textContent = unchanged ? (v.parent === null || original ? '原文与结果一致。' : '调整前后结果一致。') : diff.coarse ? '改动较多，已按整段显示差异。' : '';
  }
  function render() {
    if (snap && !snapshotCurrent(snap)) { invalidate(); return; }
    renderTool(); renderLookup();
    renderResult(activeTranslation, 'translate'); renderResult(activeWriting, 'write'); renderComparison();
    const activePreset=results.get(activeWriting)?.preset;
    const writing=results.get(activeWriting),translating=results.get(activeTranslation);
    const writeRefining=!!writing?.refineOpen && !conversations.get('write')!.drawer.hidden,translateRefining=!!translating?.refineOpen && !conversations.get('translate')!.drawer.hidden;
    const writeFocused=writeRefining || resultFocus==='write'&&writing?.state==='done';
    $('.translation').hidden=toolView==='lookup'||writeFocused;$('.writing').hidden=toolView==='lookup'||translateRefining;
    writingSummary.hidden=!writeFocused;writingControls.hidden=writeFocused&&!writing?.controlsOpen;
    modeLabel.translate=!activePreset;modeLabel.textContent=activePreset?.name || (selectedMode==='custom'?'自定义改写':MODES[selectedMode]);
    changeMode.textContent=writing?.controlsOpen?'收起改写方式':'更换方式';changeMode.setAttribute('aria-expanded',String(!writingControls.hidden));
    presetControls.select(activePreset?.id);
    panel.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => { b.classList.toggle('selected', b.dataset.mode === selectedMode && !!activeWriting); b.setAttribute('aria-pressed', String(b.dataset.mode === selectedMode && !!activeWriting)); });
  }
  launcher.addEventListener('pointerdown', e => e.preventDefault());
  launcher.addEventListener('click', () => { void config().then(() => { if (candidate && !blocked()) show(candidate); }); });
  panel.addEventListener('pointerdown', e => {
    if ((e.target as Element).closest('button:not([data-view])')) e.preventDefault();
  });
  panel.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (b?.dataset.action === 'close') {close();options.onClose?.();}
    if (b?.dataset.action === 'reset-layout') resetLayout();
    if (b?.dataset.action === 'settings') void chrome.runtime.sendMessage({ type: 'options' }).catch(()=>notify('扩展已更新，请刷新网页后使用。'));
    if (b?.dataset.view && current()) { writeView = b.dataset.view === 'compare' ? 'compare' : 'result'; renderComparison(); }
    if (b?.dataset.tool) {
      const next = b.dataset.tool === 'lookup' ? 'lookup' : 'writing';
      if (toolView !== next) {
        if (next === 'lookup') { cancelResult(activeTranslation); cancelResult(activeWriting); } else cancelResult(activeLookup);
        toolView = next; render(); notifySource();
        start(next === 'lookup' ? 'lookup' : 'translate');
      }
    }
    if (b?.dataset.mode) start(b.dataset.mode as Mode);
  });
  $<HTMLSelectElement>('.diff-baseline select').addEventListener('change', () => { if (current()) renderComparison(); });
  language.addEventListener('change', () => start('translate'));
  const submitCustom=()=>{if(!shortcutGuard.ready())return;const input=$<HTMLInputElement>('.custom input');if(input.value.trim())start('custom',input.value.trim());};
  $('.custom button').addEventListener('click',submitCustom);
  $<HTMLInputElement>('.custom input').title='Enter 执行自定义改写';
  $<HTMLInputElement>('.custom input').addEventListener('keydown',e=>{
    if(e.key!=='Enter'||!plainKey(e)||!shortcutGuard.accepts(e))return;
    shortcutGuard.consume(e);if(!e.repeat)submitCustom();
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||!plainKey(e)||composing||!shortcutGuard.accepts(e))return;
    // The inline review owns Escape while its controls have keyboard focus.
    if(e.composedPath().some(el=>el instanceof HTMLElement&&el.id==='lingo-inline-root'))return;
    for(const prefix of ['translate','write'] as const){const c=conversations.get(prefix)!;if(!c.drawer.hidden&&e.composedPath().includes(c.drawer)){shortcutGuard.consume(e);if(!e.repeat)closeRefinement(prefix);return;}}
    if(!docked&&(!panel.hidden||!launcher.hidden)){shortcutGuard.consume(e);if(!e.repeat)close();}
  },true);
  if(!docked) {
  document.addEventListener('pointerdown', e => {
    if (e.composedPath().includes(host)) return;
    lastPointer = { x: e.clientX, y: e.clientY };
    if (!panel.hidden) close();
  }, true);
  document.addEventListener('pointerup', e => { if (e.button===0 && !e.composedPath().includes(host)) {const point={x:e.clientX,y:e.clientY};lastPointer=point;setTimeout(()=>scan(point),0);} }, true);
  document.addEventListener('keyup', e => { if (!e.composedPath().includes(host) && e.key !== 'Escape') setTimeout(scan, 0); }, true);
  document.addEventListener('compositionstart', () => { composing = true; launcher.hidden = true; }, true);
  document.addEventListener('compositionend', () => { composing = false; }, true);
  document.addEventListener('input', e => { if (!e.composedPath().includes(host) && !panel.hidden && snap) current(); }, true);
  document.addEventListener('scroll', e => { if (!(e.composedPath().includes(host))) launcher.hidden = true; }, true);
  window.addEventListener('resize', () => { launcher.hidden = true; if (!panel.hidden && snap) position(panel, snap.rect); });
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'refreshConfig') { void config(); return; }
    if (msg.type === 'open') {
      void config().then(() => {
        if (blocked()) { reply({ ok: false, error: '此站点已暂停，请从 Lingo 菜单重新启用。' }); return; }
        if (sensitiveFieldActive()) { reply({ ok: false, error: '请先在非密码区域选中文字。' }); return; }
        const s = capture() || candidate || (msg.fallback ? { text: String(msg.fallback), kind: 'read' as const, rect: new DOMRect(30, 50, 0, 20) } : null);
        if (!s || !s.text.trim() || s.text.length > MAX_TEXT) { reply({ ok: false, error: '请先选中 1–16,000 个字符，再打开 Lingo。' }); return; }
        show(s); reply({ ok: true });
      }); return true;
    }
  });
  }
  if(docked){void presetControls.refresh();for(const attr of ['tabindex','aria-label','title'])$('.drag-handle').removeAttribute(attr);mount();close();$('[data-action="reset-layout"]').setAttribute('title','清除');$('[data-action="reset-layout"]').setAttribute('aria-label','清除');sourceEditor!.focus();}
  return {clear:close, refresh:config, showText:async(text:string,mode?:'translate'|'proofread')=>{await config();show({text,kind:'read',rect:new DOMRect()},settings.language,mode);}};
}
