import { DEFAULTS, LANGUAGES, buildRequest, consumeSSE, apiError, type Settings, type Task } from './core';

const ready = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
]);
async function config() {
  await ready;
  const local = await chrome.storage.local.get(['settings', 'apiKey']);
  const session = await chrome.storage.session.get('apiKey');
  return { settings: { ...DEFAULTS, ...(local.settings as Partial<Settings> || {}) } as Settings, apiKey: String(session.apiKey || local.apiKey || ''), remember: !!local.apiKey };
}
function trusted(sender: chrome.runtime.MessageSender) {
  // An options page opened in a tab also has sender.tab; trust its extension URL.
  return sender.id === chrome.runtime.id && ['options.html', 'popup.html'].some(page => sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL(page));
}
async function publicConfig() {
  const c = await config();
  return { settings: c.settings, hasKey: !!c.apiKey, remember: c.remember };
}
let registration = Promise.resolve();
function syncScripts() {
  registration = registration.catch(() => {}).then(async () => {
    const permissions = await chrome.permissions.getAll();
    const matches = (permissions.origins || []).filter(x => /^https?:/.test(x) && x !== 'https://api.openai.com/*');
    const old = await chrome.scripting.getRegisteredContentScripts();
    if (old.some(x => x.id === 'lingo-selection')) await chrome.scripting.unregisterContentScripts({ ids: ['lingo-selection'] });
    if (matches.length) await chrome.scripting.registerContentScripts([{ id: 'lingo-selection', matches, js: ['content.js'], runAt: 'document_idle', allFrames: true, persistAcrossSessions: true }]);
  });
  return registration;
}
chrome.permissions.onAdded.addListener(() => { void syncScripts(); });
chrome.permissions.onRemoved.addListener(() => { void syncScripts(); });
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
  void chrome.contextMenus.removeAll().then(() => chrome.contextMenus.create({ id: 'lingo-open', title: '用 Lingo 翻译与修改', contexts: ['selection', 'editable'] }));
  void syncScripts();
});
chrome.runtime.onStartup.addListener(() => { void syncScripts(); });

async function openSelection(tabId: number, frameId = 0, fallback = '') {
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['content.js'] });
    const result = await chrome.tabs.sendMessage(tabId, { type: 'open', fallback }, { frameId });
    if (!result?.ok) throw new Error(result?.error || '请先选中文字，再打开 Lingo。');
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error && /请先|暂停|字符/.test(e.message) ? e.message : '此页面无法使用扩展。请在普通网页中选择文字后重试。' }; }
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lingo-open' && tab?.id) void openSelection(tab.id, info.frameId || 0, info.selectionText || '');
});
chrome.commands.onCommand.addListener((command, tab) => { if (command === 'open-selection' && tab?.id) void openSelection(tab.id); });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  (async () => {
    if (msg.type === 'config') return publicConfig();
    if (msg.type === 'options') { await chrome.runtime.openOptionsPage(); return { ok: true }; }
    if (!trusted(sender)) throw new Error('此操作只能从扩展设置页执行。');
    if (msg.type === 'save') {
      const old = await config();
      if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(msg.model || '') || !LANGUAGES.includes(msg.language)) throw new Error('请填写有效模型名称并选择目标语言。');
      const settings = { ...old.settings, model: msg.model, language: msg.language };
      let apiKey = old.apiKey;
      if (msg.key !== undefined && msg.key !== '') {
        if (typeof msg.key !== 'string' || !/^sk-[\x21-\x7e]{15,500}$/.test(msg.key.trim())) throw new Error('Key 格式不正确，请完整粘贴以 sk- 开头的 API Key。');
        apiKey = msg.key.trim();
      }
      await chrome.storage.local.set({ settings });
      if (msg.remember) { await chrome.storage.local.set({ apiKey }); await chrome.storage.session.remove('apiKey'); }
      else { await chrome.storage.session.set({ apiKey }); await chrome.storage.local.remove('apiKey'); }
      return publicConfig();
    }
    if (msg.type === 'deleteKey') { await chrome.storage.local.remove('apiKey'); await chrome.storage.session.remove('apiKey'); return publicConfig(); }
    if (msg.type === 'syncSites') { await syncScripts(); return { ok: true }; }
    if (msg.type === 'unblock') {
      const c = await config(); c.settings.blockedHosts = c.settings.blockedHosts.filter(x => x !== msg.host);
      await chrome.storage.local.set({ settings: c.settings });
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.filter(tab => tab.id && tab.url && /^https?:/.test(tab.url) && new URL(tab.url).hostname === msg.host).map(tab => chrome.tabs.sendMessage(tab.id!, { type: 'refreshConfig' }).catch(() => {})));
      return { ok: true };
    }
    if (msg.type === 'toggleSite') {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0]; if (!tab?.url || !/^https?:/.test(tab.url)) throw new Error('请打开普通网页。');
      const host = new URL(tab.url).hostname; const c = await config();
      c.settings.blockedHosts = c.settings.blockedHosts.includes(host) ? c.settings.blockedHosts.filter(x => x !== host) : [...c.settings.blockedHosts, host];
      await chrome.storage.local.set({ settings: c.settings });
      if (tab.id) await chrome.tabs.sendMessage(tab.id, { type: 'refreshConfig' }).catch(() => {});
      return publicConfig();
    }
    if (msg.type === 'openActive') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('找不到当前标签页。');
      return openSelection(tab.id);
    }
    throw new Error('未知操作。');
  })().then(reply).catch(e => reply({ error: e.message || '操作失败，请重试。' }));
  return true;
});

const running = new Set<AbortController>();
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'lingo-task' || port.sender?.id !== chrome.runtime.id) { port.disconnect(); return; }
  const sender = port.sender;
  if (!trusted(sender) && (!sender.tab || !/^https?:/.test(sender.url || ''))) { port.disconnect(); return; }
  let controller: AbortController | null = null;
  let closed = false;
  const send = (event: object) => { if (!closed) try { port.postMessage(event); } catch {} };
  port.onDisconnect.addListener(() => { closed = true; controller?.abort(); });
  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'cancel') { controller?.abort(); return; }
    if (msg.type !== 'run' || controller) return;
    const task = msg.task as Task;
    controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      const c = await config();
      if (!c.apiKey) throw new Error('请先打开设置，填写你的 OpenAI API Key。');
      if (sender.tab && c.settings.blockedHosts.includes(new URL(sender.url!).hostname)) throw new Error('此站点已暂停 Lingo，请从扩展菜单重新启用。');
      const request = buildRequest(task, c.settings.model);
      if (running.size >= 4) throw new Error('已有多个请求进行中，请完成或取消后重试。');
      running.add(controller);
      const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => { timedOut = true; controller?.abort(); }, 25000); };
      resetIdle();
      timeout = setTimeout(() => { timedOut = true; controller?.abort(); }, 120000);
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { 'Authorization': `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: controller.signal
      });
      if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(apiError(res.status, error?.error?.code)); }
      if (!res.body) throw new Error('服务未返回内容，请重试。');
      let completed = false, output = '', refused = false;
      await consumeSSE(res.body, event => {
        resetIdle();
        if (event.type === 'response.output_text.delta') {
          output += event.delta || '';
          if (output.length > 100000) throw new Error('结果过长，请缩短原文后重试。');
          send({ type: 'delta', id: task.id, text: event.delta || '' });
        }
        if (event.type === 'response.refusal.delta' || event.type === 'response.refusal.done') refused = true;
        if (event.type === 'error' || event.type === 'response.failed') throw new Error('生成失败，请检查模型是否支持 Responses API 后重试。');
        if (event.type === 'response.incomplete') throw new Error('结果未生成完整，请缩短原文后重试。');
        if (event.type === 'response.completed') completed = true;
      });
      if (refused) throw new Error('模型未能处理这段文字，请调整原文或要求。');
      if (!completed) throw new Error('连接中断，结果未完整返回，请重试。');
      if (!output.trim()) throw new Error('模型返回了空结果，请重试。');
      send({ type: 'done', id: task.id });
    } catch (e) {
      send({ type: 'error', id: task?.id, error: timedOut ? '请求超时，请稍后重试。' : controller.signal.aborted ? '已停止生成。' : e instanceof TypeError ? '网络连接失败，请检查网络后重试。' : (e as Error).message || '请求失败，请重试。' });
    } finally { clearTimeout(timeout); clearTimeout(idle); if (controller) running.delete(controller); }
  });
});
