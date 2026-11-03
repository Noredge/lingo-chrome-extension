import { t, setLanguage } from './i18n';
import { DEFAULTS, LANGUAGES, languagePreferences, buildRequest, readChatResponse, normalizeBaseUrl, apiOrigin, validKey, DEFAULT_BASE_URL, type Settings, type Task } from './core';
import { encryptKey, decryptKey } from './vault';
import { encryptDeviceKey, decryptDeviceKey, removeDeviceKey } from './device-vault';

const ready = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
]).then(async () => {
  // Remove legacy plaintext only after its session-only replacement succeeds.
  const legacy = await chrome.storage.local.get('apiKey');
  if (typeof legacy.apiKey === 'string' && legacy.apiKey) {
    const current = await chrome.storage.session.get('apiKey');
    await chrome.storage.session.set({ apiKey: current.apiKey || legacy.apiKey, legacyMigrated: true });
    await chrome.storage.local.set({keyStorageMode: 'session'});
  }
  await chrome.storage.local.remove('apiKey');
});
async function config() {
  await ready;
  const local: any = await chrome.storage.local.get(['settings', 'encryptedKey', 'deviceKey', 'keyStorageMode', 'dataConsent','credentialBaseUrl','consentBaseUrl','apiOrigins']);
  const session = await chrome.storage.session.get(['apiKey', 'legacyMigrated','credentialBaseUrl']);
  const baseUrl = normalizeBaseUrl(local.settings?.baseUrl || DEFAULT_BASE_URL);
  setLanguage(local.settings?.uiLanguage || 'auto');
  let apiKey = (session.credentialBaseUrl || DEFAULT_BASE_URL) === baseUrl ? String(session.apiKey || '') : '', deviceError = false;
  if (!apiKey && local.deviceKey) {
    try { apiKey = await decryptDeviceKey(local.deviceKey, baseUrl); } catch { deviceError = true; }
  }
  return { credentialBaseUrl: local.credentialBaseUrl || DEFAULT_BASE_URL, apiOrigins: local.apiOrigins || [], settings: { ...DEFAULTS, ...(local.settings as Partial<Settings> || {}), ...languagePreferences(local.settings || {}), baseUrl } as Settings, apiKey, deviceError, deviceVault: local.deviceKey, storageMode: local.deviceKey ? 'device' : local.encryptedKey ? 'encrypted' : typeof local.keyStorageMode === 'string' && ['device','session','encrypted'].includes(local.keyStorageMode) ? local.keyStorageMode : session.apiKey ? 'session' : 'device', vault: local.encryptedKey, remember: !!local.encryptedKey, dataConsent: local.dataConsent === 1 && (local.consentBaseUrl || DEFAULT_BASE_URL) === baseUrl, migrated: !!session.legacyMigrated };
}
function trusted(sender: chrome.runtime.MessageSender) {
  // An options page opened in a tab also has sender.tab; trust its extension URL.
  return sender.id === chrome.runtime.id && ['options.html', 'popup.html', 'sidepanel.html'].some(page => sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL(page));
}
async function publicConfig() {
  const c = await config();
  return { apiOrigins: c.apiOrigins, settings: c.settings, hasKey: !!c.apiKey, hasVault: !!c.vault, remember: c.remember, storageMode: c.storageMode, deviceError: c.deviceError, dataConsent: c.dataConsent, migrated: c.migrated };
}
let stateQueue = Promise.resolve<unknown>(undefined), credentialEpoch = 0;
function mutateState(action: () => Promise<unknown>, stopRequests = true) {
  const operation = stateQueue.catch(() => {}).then(async () => {
    await ready; credentialEpoch++; if (stopRequests) running.forEach(controller => controller.abort());
    return action();
  });
  stateQueue = operation; return operation;
}
async function credentialAction(msg: any) {
  const old = await config();
  if (msg.type === 'lock') {
    if (old.storageMode === 'device') throw new Error('免解锁模式不使用密码锁定；请删除 Key，或改为加密保存。');
    await chrome.storage.session.remove(['apiKey','legacyMigrated','credentialBaseUrl']); return publicConfig();
  }
  if (msg.type === 'deleteKey') {
    await chrome.storage.local.remove(['encryptedKey','deviceKey','apiKey','credentialBaseUrl']);
    await chrome.storage.session.remove(['apiKey','legacyMigrated','credentialBaseUrl']); await removeDeviceKey(); return publicConfig();
  }
  if (msg.type === 'unlock') {
    if (!old.vault) throw new Error('尚未加密保存 Key。');
    const apiKey = await decryptKey(old.vault, msg.password, old.settings.baseUrl);
    if (!validKey(apiKey)) throw new Error('加密数据中的 Key 格式不正确，请重新保存。');
    await chrome.storage.session.set({apiKey, credentialBaseUrl: old.settings.baseUrl}); return publicConfig();
  }
  if (typeof msg.model !== 'string' || !/^[\x21-\x7e]{1,160}$/.test(msg.model) || !LANGUAGES.includes(msg.language)) throw new Error('请填写有效模型名称并选择目标语言。');
  const languages = msg.languages ?? old.settings.languages;
  if (!Array.isArray(languages) || !languages.length || languages.length > LANGUAGES.length || languages.some(l => typeof l !== 'string' || !LANGUAGES.includes(l)) || !languages.includes(msg.language)) throw new Error('请至少保留一种浮窗语言，并从中选择默认语言。');
  const baseUrl = normalizeBaseUrl(msg.baseUrl ?? old.settings.baseUrl);
  const uiLanguage = msg.uiLanguage ?? old.settings.uiLanguage;
  if (!['auto','zh-CN','zh-TW','en'].includes(uiLanguage)) throw new Error('请选择有效的界面语言。');
  if (baseUrl !== old.settings.baseUrl && !validKey(msg.key?.trim()) && (old.apiKey || old.vault || old.deviceVault)) throw new Error('更换服务地址时，请填写该服务的新 Key。旧 Key 不会转发到新地址。');
  if (!await chrome.permissions.contains({origins:[apiOrigin(baseUrl)]})) throw new Error('请先授权连接此 API 服务。');
  const settings = { ...old.settings, baseUrl, uiLanguage, model: msg.model, language: msg.language, languages: [...new Set<string>(languages)] };
  let apiKey = old.apiKey;
  if (msg.key !== undefined && msg.key !== '') {
    if (typeof msg.key !== 'string' || !validKey(msg.key.trim())) throw new Error('Key 格式不正确，请完整粘贴服务商提供的 API Key（8–512 个字符）。');
    apiKey = msg.key.trim();
  }
  const storageMode = msg.storageMode ?? (msg.remember ? 'encrypted' : 'session');
  if (!['session','encrypted','device'].includes(storageMode)) throw new Error('请选择有效的 Key 保存方式。');
  if (storageMode === 'device' && msg.deviceConsent !== true) throw new Error('请确认免解锁模式使用本机自动加密保存 Key。');
  if (!apiKey && storageMode !== old.storageMode && (old.vault || old.deviceVault)) throw new Error(old.vault ? '请先解锁已保存的 Key，或填写新 Key，再更改保存方式。' : '本机凭据无法读取，请先重新填写 Key，或使用删除 Key。');
  let vault = old.vault;
  if (storageMode === 'encrypted' && (apiKey || msg.password) && (!vault || msg.key || msg.password)) {
    if (!apiKey) throw new Error('请先填写 Key 或解锁已保存的 Key。');
    if (typeof msg.password !== 'string' || msg.password !== msg.passwordConfirm) throw new Error('两次解锁密码不一致。');
    vault = await encryptKey(apiKey, msg.password, baseUrl);
  }
  const deviceKey = storageMode === 'device' ? (apiKey ? await encryptDeviceKey(apiKey, baseUrl) : old.deviceVault) : undefined;
  // Finish validation/encryption before touching stored credentials.
  await chrome.storage.local.set({settings, credentialBaseUrl: baseUrl, consentBaseUrl: baseUrl, apiOrigins: [...new Set([...old.apiOrigins, apiOrigin(baseUrl)])], keyStorageMode: storageMode, dataConsent: msg.dataConsent === true ? 1 : 0, ...(storageMode === 'encrypted' && vault ? {encryptedKey: vault} : storageMode === 'device' && deviceKey ? {deviceKey} : {})});
  if (apiKey) await chrome.storage.session.set({apiKey, credentialBaseUrl: baseUrl});
  else await chrome.storage.session.remove(['apiKey','credentialBaseUrl']);
  if (storageMode !== 'encrypted') await chrome.storage.local.remove('encryptedKey');
  if (storageMode !== 'device') { await chrome.storage.local.remove('deviceKey'); await removeDeviceKey(); }
  await chrome.storage.session.remove('legacyMigrated');
  setLanguage(uiLanguage); void refreshMenu(); void syncScripts();
  void chrome.tabs.query({}).then(tabs => Promise.all(tabs.filter(t => t.id).map(t => chrome.tabs.sendMessage(t.id!, {type:'refreshConfig'}).catch(() => {}))));
  return publicConfig();
}
let registration = Promise.resolve();
function syncScripts() {
  registration = registration.catch(() => {}).then(async () => {
    const permissions = await chrome.permissions.getAll();
    const local: any = await chrome.storage.local.get('apiOrigins');
    const matches = (permissions.origins || []).filter(x => /^https?:/.test(x) && x !== 'https://api.openai.com/*' && !(local.apiOrigins || []).includes(x));
    const old = await chrome.scripting.getRegisteredContentScripts();
    if (old.some(x => x.id === 'lingo-selection')) await chrome.scripting.unregisterContentScripts({ ids: ['lingo-selection'] });
    if (matches.length) await chrome.scripting.registerContentScripts([{ id: 'lingo-selection', matches, js: ['content.js'], runAt: 'document_idle', allFrames: true, persistAcrossSessions: true }]);
  });
  return registration;
}
chrome.permissions.onAdded.addListener(() => { void syncScripts(); });
chrome.permissions.onRemoved.addListener(() => { running.forEach(controller => controller.abort()); void syncScripts(); });
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
  void refreshMenu();
  void syncScripts();
});
chrome.runtime.onStartup.addListener(() => { void syncScripts(); void refreshMenu(); });
let menuQueue = Promise.resolve();
function refreshMenu() { menuQueue = menuQueue.catch(()=>{}).then(async()=>{await config();await chrome.contextMenus.removeAll();chrome.contextMenus.create({id:'lingo-open',title:t('用 Lingo 翻译'),contexts:['selection']});}); return menuQueue; }
void refreshMenu();

async function openSelection(tabId: number, frameId = 0, fallback = '') {
  try {
    await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['content.js'] });
    const result = await chrome.tabs.sendMessage(tabId, { type: 'open', fallback }, { frameId });
    if (!result?.ok) throw new Error(result?.error || '请先选中文字，再打开 Lingo。');
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error && /请先|暂停|字符/.test(e.message) ? e.message : '此页面无法使用扩展。请在普通网页中选择文字后重试。' }; }
}
// Invoke sidePanel.open synchronously in the actual menu gesture, including Chrome PDF viewer.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'lingo-open' || tab?.id === undefined || !info.selectionText?.trim()) return;
  if (info.editable) { void openSelection(tab.id, info.frameId || 0, info.selectionText); return; }
  const tabId = tab.id, windowId = tab.windowId;
  const item = {id:crypto.randomUUID(),text:info.selectionText.slice(0,16001),tabId,created:Date.now()};
  // Window-specific one-shot inbox; survives service worker suspension, never local disk storage.
  void chrome.storage.session.set({['panel:'+windowId]:item});
  void chrome.sidePanel.open({windowId}).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tabId => {
  void chrome.storage.session.get(null).then(items => chrome.storage.session.remove(Object.keys(items).filter(k => k.startsWith('panel:') && (items[k] as any)?.tabId === tabId)));
});
chrome.windows.onRemoved.addListener(id => { void chrome.storage.session.remove('panel:'+id); });
chrome.commands.onCommand.addListener((command, tab) => { if (command === 'open-selection' && tab?.id) void openSelection(tab.id); });

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  (async () => {
    if (msg.type === 'config') return publicConfig();
    if (msg.type === 'options') { await chrome.runtime.openOptionsPage(); return { ok: true }; }
    if (!trusted(sender)) throw new Error('此操作只能从扩展设置页执行。');
    if (['save','unlock','lock','deleteKey'].includes(msg.type)) return mutateState(() => credentialAction(msg));
    if (msg.type === 'panelSelection') {
      const windowId = msg.windowId; if (!Number.isInteger(windowId) || sender.url?.split(/[?#]/)[0] !== chrome.runtime.getURL('sidepanel.html')) throw new Error('未知操作。');
      const key = 'panel:'+windowId, items = await chrome.storage.session.get(key);
      const item = items[key] as any; if (!item || Date.now()-item.created > 300000) { await chrome.storage.session.remove(key); return {}; }
      await chrome.storage.session.remove(key); return item;
    }
    if (msg.type === 'syncSites') { await syncScripts(); return { ok: true }; }
    if (msg.type === 'unblock') return mutateState(async () => {
      const c = await config(); c.settings.blockedHosts = c.settings.blockedHosts.filter(x => x !== msg.host);
      await chrome.storage.local.set({ settings: c.settings });
      const tabs = await chrome.tabs.query({});
      await Promise.all(tabs.filter(tab => tab.id && tab.url && /^https?:/.test(tab.url) && new URL(tab.url).hostname === msg.host).map(tab => chrome.tabs.sendMessage(tab.id!, { type: 'refreshConfig' }).catch(() => {})));
      return { ok: true };
    }, false);
    if (msg.type === 'toggleSite') return mutateState(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0]; if (!tab?.url || !/^https?:/.test(tab.url)) throw new Error('请打开普通网页。');
      const host = new URL(tab.url).hostname; const c = await config();
      c.settings.blockedHosts = c.settings.blockedHosts.includes(host) ? c.settings.blockedHosts.filter(x => x !== host) : [...c.settings.blockedHosts, host];
      await chrome.storage.local.set({ settings: c.settings });
      if (tab.id) await chrome.tabs.sendMessage(tab.id, { type: 'refreshConfig' }).catch(() => {});
      return publicConfig();
    }, false);
    if (msg.type === 'openActive') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('找不到当前标签页。');
      return openSelection(tab.id);
    }
    throw new Error('未知操作。');
  })().then(reply).catch(e => reply({ error: t(e.message || '操作失败，请重试。') }));
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
      await stateQueue.catch(() => {});
      const epoch = credentialEpoch;
      const c = await config();
      if (epoch !== credentialEpoch || closed) throw new Error('设置已变化，请重新操作。');
      if (!c.dataConsent) throw new Error('请先在设置中确认将选中文字发送给所选服务的说明并保存。');
      if (c.deviceError) throw new Error('本机凭据无法读取，请重新填写 API Key 并保存。');
      if (!c.apiKey && c.vault) throw new Error('Key 已锁定，请在设置中输入本机解锁密码。');
      if (!c.apiKey) throw new Error('请先打开设置，填写你的 API Key。');
      if (!trusted(sender) && sender.tab && c.settings.blockedHosts.includes(new URL(sender.url!).hostname)) throw new Error('此站点已暂停 Lingo，请从扩展菜单重新启用。');
      const request = buildRequest(task, c.settings.model);
      if (!trusted(sender)) {
        try {
          await chrome.scripting.executeScript({
            target: {tabId: sender.tab!.id!, ...(sender.documentId ? {documentIds:[sender.documentId]} : {frameIds:[sender.frameId || 0]})},
            func: () => true
          });
        } catch { throw new Error('网站授权已失效，请重新授权，或从扩展菜单临时调用。'); }
      }
      if (epoch !== credentialEpoch || closed || controller.signal.aborted) throw new Error('设置已变化，请重新操作。');
      if (running.size >= 4) throw new Error('已有多个请求进行中，请完成或取消后重试。');
      running.add(controller);
      const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => { timedOut = true; controller?.abort(); }, 25000); };
      resetIdle();
      timeout = setTimeout(() => { timedOut = true; controller?.abort(); }, 120000);
      if (!await chrome.permissions.contains({origins:[apiOrigin(c.settings.baseUrl)]})) throw new Error('API 服务授权已失效，请在设置中重新授权。');
      if (c.credentialBaseUrl !== c.settings.baseUrl) throw new Error('凭据与服务地址不匹配，请重新保存 Key。');
      const res = await fetch(c.settings.baseUrl + '/chat/completions', {
        redirect:'error', credentials:'omit', referrerPolicy:'no-referrer',
        method: 'POST', headers: { 'Authorization': `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: controller.signal
      });
      await readChatResponse(res, text => send({type:'delta', id:task.id, text}), resetIdle);
      send({ type: 'done', id: task.id });
    } catch (e) {
      send({ type: 'error', id: task?.id, error: t(timedOut ? '请求超时，请稍后重试。' : controller.signal.aborted ? '已停止生成。' : e instanceof TypeError ? '网络连接失败，请检查网络后重试。' : (e as Error).message || '请求失败，请重试。') });
    } finally { clearTimeout(timeout); clearTimeout(idle); if (controller) running.delete(controller); }
  });
});
