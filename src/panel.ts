import { localize, setLanguage } from './i18n';
import { DEFAULTS, MODES, MAX_TEXT, type Mode, type Settings } from './core';
import { capture, canReplace, replaceSelection, sensitiveFieldActive, type Snapshot } from './selection';
import css from './overlay.css?inline';
import { resizeBounds, type Edge } from './layout';

export function createPanel(options:{container?:HTMLElement;onClose?:()=>void}={}) {
  const docked=!!options.container;
  const host = document.createElement('div'); host.id = 'lingo-extension-root';
  host.style.cssText = docked ? 'display:block;height:100%;color-scheme:light' : 'all:initial!important;position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;z-index:2147483647!important;color-scheme:light!important';
  const root = host.attachShadow({ mode: 'open' }); localize(root);
  const style = document.createElement('style'); style.textContent = css + (docked ? '.panel{position:relative;inset:auto!important;width:100%;height:100%;min-width:0;min-height:0;max-width:none;max-height:none;border:0;border-radius:0;box-shadow:none}.drag-handle{cursor:default}.model{max-width:45%}.result{max-height:none}.panel .source[hidden]{display:none!important}' : ''); root.append(style);
  const launcher = document.createElement('button'); launcher.className = 'launcher'; launcher.textContent = '文'; launcher.title = 'Lingo · 翻译与修改'; launcher.setAttribute('aria-label', '用 Lingo 翻译选中文字'); launcher.hidden = true; root.append(launcher);
  const panel = document.createElement('section'); panel.className = 'panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Lingo 翻译与写作'); root.append(panel);
  // Constant markup only. Selected text and model output are always assigned using textContent.
  panel.innerHTML = `<header class="drag-handle" tabindex="0" role="group" aria-label="移动浮窗：拖动标题栏，或聚焦后用方向键移动" title="拖动标题栏移动浮窗"><div class="brand"><span class="logo">文</span><div><strong>Lingo</strong><small>读懂，也写得更好</small></div></div><div class="header-actions"><button data-action="reset-layout" class="icon" title="恢复默认位置和大小" aria-label="恢复默认位置和大小">↺</button><button data-action="settings" class="icon" title="打开设置" aria-label="打开设置">⚙</button><button data-action="close" class="icon" title="关闭 · Esc" aria-label="关闭">×</button></div></header>
    <div class="body"><details class="source"><summary>选中的原文 <span class="count"></span></summary><div class="source-text" translate="no" dir="auto"></div></details>
    <section class="translation"><div class="section-title"><span class="eyebrow">翻译</span><select aria-label="翻译目标语言" class="language"></select></div><div class="result translate-text" translate="no" dir="auto"></div><div class="result-status translate-status" role="status" aria-live="polite"></div><div class="result-actions translate-actions"></div></section>
    <section class="writing"><div class="section-title"><span class="eyebrow">写作工具</span><span class="hint">始终基于原文</span></div><div class="presets"></div><form class="custom"><input aria-label="自定义修改要求" maxlength="1000" placeholder="试试：更委婉一点…"><button type="submit" aria-label="执行自定义改写">↗</button></form><div class="write-output" hidden><div class="write-label"></div><div class="result write-text" translate="no" dir="auto"></div><div class="result-status write-status" role="status" aria-live="polite"></div><div class="result-actions write-actions"></div></div></section></div>
    <footer><span class="notice" role="status">仅发送选中文字</span><span class="model" translate="no"></span></footer>`;
  const $ = <T extends Element = HTMLElement>(s: string) => panel.querySelector<T>(s)!;
  const language = $<HTMLSelectElement>('.language');
  const sourceEditor=docked?document.createElement('textarea'):null;
  if(sourceEditor){
    sourceEditor.className='source-editor';sourceEditor.rows=5;sourceEditor.setAttribute('aria-label','编辑原文');sourceEditor.placeholder='在此粘贴或修改原文…';sourceEditor.dir='auto';
    $('.source summary').firstChild!.textContent='原文 ';$('.source-text').setAttribute('hidden','');$('.source').append(sourceEditor);
    const actions=document.createElement('div');actions.className='source-actions';const submit=document.createElement('button');submit.type='button';submit.className='source-submit';submit.textContent='翻译';actions.append(submit);$('.source').append(actions);
    const submitSource=()=>{const text=sourceEditor.value;if(!text.trim()||text.length>MAX_TEXT)return;const target=language.value;show({text,kind:'read',rect:new DOMRect()},true,target);};
    submit.addEventListener('click',submitSource);
    sourceEditor.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();submitSource();}});
    sourceEditor.addEventListener('input',()=>{
      generation++;stopAll();snap=null;activeWriting=activeTranslation='';render();$('.write-output').hidden=true;
      $('.source-text').textContent=sourceEditor.value;$('.count').textContent=`${sourceEditor.value.length} 字符`;
      submit.disabled=!sourceEditor.value.trim()||sourceEditor.value.length>MAX_TEXT;
      $('.translate-status').textContent=sourceEditor.value.length>MAX_TEXT?'选中文字过长，请缩短到 16,000 个字符以内。':'点击翻译，更新结果。';
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
  let composing = false, lastPointer = { x: 30, y: 60 }, activeWriting = '', activeTranslation = '';
  type Result = { text: string; state: 'loading' | 'done' | 'error'; error?: string; mode: Mode; instruction: string; language: string; port?: chrome.runtime.Port; timer?: ReturnType<typeof setTimeout> };
  const results = new Map<string, Result>();
  async function config() {
    try { const c = await chrome.runtime.sendMessage({ type: 'config' }); if (c?.settings) { const serviceChanged = profileId !== c.profileId || settings.baseUrl !== c.settings.baseUrl || settings.model !== c.settings.model; profileId=c.profileId; settings = c.settings; setLanguage(settings.uiLanguage); if (serviceChanged && !panel.hidden) close(); hasKey = c.hasKey; hasVault = c.hasVault; } }
    catch { notify('扩展已更新，请刷新网页后使用。'); }
    language.replaceChildren(...settings.languages.map(l => { const o = document.createElement('option'); o.value = l; o.textContent = l.split('（')[0]; o.translate = false; return o; }));
    language.value = settings.language; $('.model').textContent = new URL(settings.baseUrl).host + ' · ' + settings.model; $('.model').setAttribute('title', settings.baseUrl + '/responses');
    if (settings.blockedHosts.includes(location.hostname)) close();
  }
  void config();
  function mount() { if (!host.isConnected) (options.container || document.documentElement).append(host); }
  function blocked() { return settings.blockedHosts.includes(location.hostname); }
  function notify(text: string) { $('.notice').textContent = text; }
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
  function stopAll() { results.forEach(r => { clearTimeout(r.timer); r.port?.disconnect(); }); results.clear(); }
  function close() {
    gesture = null; panel.classList.remove('adjusting');
    generation++; stopAll(); snap?.cleanup?.(); candidate?.cleanup?.(); snap = candidate = null; panel.hidden = launcher.hidden = true;
    for (const selector of ['.source-text','.translate-text','.write-text','.translate-status','.write-status','.translate-actions','.write-actions']) $(selector).replaceChildren();
    $<HTMLInputElement>('.custom input').value = '';
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
  function show(snapshot: Snapshot, keepOpen=false, targetLanguage=settings.language) {
    $('.source').hidden=false;
    generation++; stopAll(); snap?.cleanup?.(); if (candidate && candidate !== snapshot) candidate.cleanup?.();
    snap = snapshot; candidate = null; activeWriting = activeTranslation = ''; selectedMode = 'proofread';
    $<HTMLInputElement>('.custom input').value = '';
    $('.write-output').hidden = true;
    $('.source-text').textContent = snapshot.text; $('.count').textContent = `${snapshot.text.length} 字符`;
    $<HTMLDetailsElement>('.source').open=docked||keepOpen;if(sourceEditor){sourceEditor.value=snapshot.text;$<HTMLButtonElement>('.source-submit').disabled=!snapshot.text.trim()||snapshot.text.length>MAX_TEXT;}
    mount(); panel.hidden = false; launcher.hidden = true; position(panel, snapshot.rect);
    notify(docked?'仅发送当前原文 · 此处可复制结果':snapshot.kind === 'read' ? '仅发送选中文字 · 此处可复制结果' : '仅发送选中文字 · 可替换所选部分');
    language.value = targetLanguage;
    start('translate');
  }
  function key(mode: Mode, instruction: string) { return JSON.stringify([mode, mode === 'translate' ? language.value : '', instruction]); }
  function start(mode: Mode, instruction = '') {
    if (!snap && sourceEditor && sourceEditor.value.trim() && sourceEditor.value.length<=MAX_TEXT)snap={text:sourceEditor.value,kind:'read',rect:new DOMRect()};
    if (!snap) return;
    const k = key(mode, instruction);
    if (mode === 'translate') { if (activeTranslation !== k) cancelResult(activeTranslation); activeTranslation = k; }
    else { if (activeWriting !== k) cancelResult(activeWriting); selectedMode = mode; activeWriting = k; $('.write-output').hidden = false; }
    if (results.get(k)?.state === 'done' || results.get(k)?.state === 'loading') { render(); return; }
    const result: Result = { text: '', state: 'loading', mode, instruction, language: language.value };
    results.set(k, result); render();
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
        if (g !== generation || event.id !== id) return;
        watchdog();
        if (event.type === 'delta') result.text += event.text;
        if (event.type === 'done') { result.state = 'done'; finish(); }
        if (event.type === 'error') { result.state = 'error'; result.error = event.error; finish(); }
        render();
      });
      port.onDisconnect.addListener(() => {
        clearTimeout(result.timer);
        if (g === generation && result.state === 'loading') { result.state = 'error'; result.error = '连接已中断，请重试。'; render(); }
      });
      port.postMessage({ type: 'run', task: { id, text: snap.text, mode, language: language.value, instruction } });
    } catch { result.state = 'error'; result.error = '扩展连接失效，请刷新页面后重试。'; render(); }
  }
  function cancelResult(k: string) {
    const r = results.get(k);
    if (r?.state === 'loading') { r.state = 'error'; r.error = '已停止生成。'; clearTimeout(r.timer); r.port?.disconnect(); r.port = undefined; }
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
    actions.replaceChildren(); text.textContent = r?.text || ''; text.classList.toggle('loading', r?.state === 'loading' && !r.text);
    status.classList.toggle('error', r?.state === 'error');
    status.textContent = !r ? '' : r.state === 'loading' ? '正在生成…' : r.state === 'error' ? r.error || '生成失败' : r.mode === 'proofread' && r.text.trim() === snap?.text.trim() ? '未发现需要修改的问题。' : '';
    if (!r) return;
    if (r.state === 'loading') actions.append(button('停止', () => { cancelResult(k); render(); }));
    if (r.state === 'error') {
      actions.append(button('重试', () => { void config().then(() => { if (r.mode === 'translate') language.value = r.language; start(r.mode, r.instruction); }); }));
      actions.append(button('打开设置', () => { void chrome.runtime.sendMessage({ type: 'options' }).catch(()=>notify('扩展已更新，请刷新网页后使用。')); }));
    }
    if (r.state === 'done') {
      actions.append(button('复制', () => { void copy(r.text); }));
      if (snap && snap.kind !== 'read') {
        const replace = button('替换选中文字', () => {
          try { replaceSelection(snap!, r.text); notify('已替换 · 可在编辑框按 ⌘Z / Ctrl+Z 撤销'); }
          catch (e) { notify((e as Error).message); }
          render();
        }, 'primary');
        replace.disabled = !canReplace(snap); replace.title = replace.disabled ? '原文已变化，请重新划选；仍可复制结果' : '只替换最初选中的部分'; actions.append(replace);
      }
    }
  }
  function render() {
    renderResult(activeTranslation, 'translate'); renderResult(activeWriting, 'write');
    $('.write-label').textContent = selectedMode === 'custom' ? '按你的要求修改' : `${MODES[selectedMode]}结果`;
    panel.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => { b.classList.toggle('selected', b.dataset.mode === selectedMode && !!activeWriting); b.setAttribute('aria-pressed', String(b.dataset.mode === selectedMode && !!activeWriting)); });
  }
  launcher.addEventListener('pointerdown', e => e.preventDefault());
  launcher.addEventListener('click', () => { void config().then(() => { if (candidate && !blocked()) show(candidate); }); });
  panel.addEventListener('pointerdown', e => {
    if ((e.target as Element).closest('button')) e.preventDefault();
  });
  panel.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (b?.dataset.action === 'close') {close();options.onClose?.();}
    if (b?.dataset.action === 'reset-layout') resetLayout();
    if (b?.dataset.action === 'settings') void chrome.runtime.sendMessage({ type: 'options' }).catch(()=>notify('扩展已更新，请刷新网页后使用。'));
    if (b?.dataset.mode) start(b.dataset.mode as Mode);
  });
  language.addEventListener('change', () => start('translate'));
  $('.custom').addEventListener('submit', e => { e.preventDefault(); const input = $<HTMLInputElement>('.custom input'); if (input.value.trim()) start('custom', input.value.trim()); });
  if(!docked) {
  document.addEventListener('pointerdown', e => {
    if (e.composedPath().includes(host)) return;
    lastPointer = { x: e.clientX, y: e.clientY };
    if (!panel.hidden) close();
  }, true);
  document.addEventListener('pointerup', e => { if (e.button===0 && !e.composedPath().includes(host)) {const point={x:e.clientX,y:e.clientY};lastPointer=point;setTimeout(()=>scan(point),0);} }, true);
  document.addEventListener('keyup', e => { if (!e.composedPath().includes(host) && e.key !== 'Escape') setTimeout(scan, 0); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && (!panel.hidden || !launcher.hidden)) { close(); e.stopPropagation(); } }, true);
  document.addEventListener('compositionstart', () => { composing = true; launcher.hidden = true; }, true);
  document.addEventListener('compositionend', () => { composing = false; }, true);
  document.addEventListener('input', e => { if (!e.composedPath().includes(host) && !panel.hidden) { if (snap?.target) snap.stale = true; render(); } }, true);
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
  if(docked){for(const attr of ['tabindex','aria-label','title'])$('.drag-handle').removeAttribute(attr);mount();close();$('[data-action="reset-layout"]').setAttribute('title','清除');$('[data-action="reset-layout"]').setAttribute('aria-label','清除');sourceEditor!.focus();}
  return {clear:close, refresh:config, showText:async(text:string)=>{await config();show({text,kind:'read',rect:new DOMRect()});}};
}
