import {DICTIONARY_KEY,readDictionary,updateDictionary} from './dictionary';
import { t, setLanguage } from './i18n';
import {readPresets,updatePresets} from './presets';
import {INLINE_DEFAULTS_KEY,INLINE_SITE_PREFIX,readInlineDefaults,readInlineOptions,resolveInlineOptions,inlineOrigin} from './inline-preferences';
import {buildCheckRequest,parseDiagnostics,type CheckTask} from './diagnostics';
import {prefersSidebar} from './surfaces';
import { buildRequest, readResponses, apiOrigin, type Task } from './core';
import {serviceReady,serviceState,publicServiceConfig,serviceAction} from './services';
const ready=serviceReady;
async function config(id?:string) {const c=await serviceState(id);setLanguage(c.settings.uiLanguage);return c;}
const publicConfig=publicServiceConfig;
function trusted(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && ['options.html','popup.html','sidepanel.html'].some(page=>sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL(page));
}
let stateQueue=Promise.resolve<unknown>(undefined),credentialEpoch=0;
function mutateState(action:()=>Promise<unknown>,stopRequests=true) {
  const operation=stateQueue.catch(()=>{}).then(async()=>{await ready;credentialEpoch++;if(stopRequests)running.forEach(c=>c.abort());return action();});stateQueue=operation;return operation;
}
async function credentialAction(msg:any) {
  const result=await serviceAction(msg);setLanguage(result.settings.uiLanguage);void refreshMenu();void syncScripts();
  void chrome.tabs.query({}).then(tabs=>Promise.all(tabs.filter(t=>t.id).map(t=>chrome.tabs.sendMessage(t.id!,{type:'refreshConfig'}).catch(()=>{}))));
  return result;
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
chrome.commands.onCommand.addListener((command, tab) => {
  if(command!=='open-selection'||tab?.id===undefined)return;
  if(prefersSidebar(tab.url||'')){void chrome.sidePanel.open({windowId:tab.windowId}).catch(()=>{});return;}
  void openSelection(tab.id);
});

// Preset edits never touch credentials, change the active service, or start/abort API requests.
let presetQueue = Promise.resolve<unknown>(undefined);
async function presetSender(sender: chrome.runtime.MessageSender) {
  if (trusted(sender)) return;
  if (!sender.tab?.id || !/^https?:/.test(sender.url || '')) throw new Error('未知操作。');
  const {settings} = await chrome.storage.local.get('settings') as {settings?:{blockedHosts?:string[]}};
  if (settings?.blockedHosts?.includes(new URL(sender.url!).hostname)) throw new Error('此站点已暂停 Lingo，请从扩展菜单重新启用。');
  try {
    await chrome.scripting.executeScript({target:{tabId:sender.tab.id,...(sender.documentId?{documentIds:[sender.documentId]}:{frameIds:[sender.frameId||0]})},func:()=>true});
  } catch {throw new Error('网站授权已失效，请重新授权，或从扩展菜单临时调用。');}
}
let dictionaryQueue=Promise.resolve<unknown>(undefined);
async function dictionaryState(){await ready;return readDictionary((await chrome.storage.local.get(DICTIONARY_KEY))[DICTIONARY_KEY]);}
async function notifyDictionary(){
  await chrome.runtime.sendMessage({type:'dictionaryChanged'}).catch(()=>{});
  const tabs=await chrome.tabs.query({});
  await Promise.all(tabs.filter(tab=>tab.id).map(tab=>chrome.tabs.sendMessage(tab.id!,{type:'dictionaryChanged'}).catch(()=>{})));
}
let inlineQueue=Promise.resolve<unknown>(undefined);
const automaticRuns=new Map<AbortController,{origin:string;includeStyle:boolean}>();
async function effectiveInline(origin:string){
  const key=INLINE_SITE_PREFIX+origin,stored=await chrome.storage.local.get([INLINE_DEFAULTS_KEY,key]);
  return {origin,key,...resolveInlineOptions(readInlineDefaults(stored[INLINE_DEFAULTS_KEY]),stored[key])};
}
async function inlinePreference(sender:chrome.runtime.MessageSender) {
  if(!sender.tab?.id||!/^https?:/.test(sender.url||''))throw new Error('未知操作。');
  return effectiveInline(new URL(sender.url!).origin);
}
async function inlineSettings(){
  const stored=await chrome.storage.local.get(null),defaults=readInlineDefaults(stored[INLINE_DEFAULTS_KEY]);
  const sites=Object.keys(stored).filter(key=>key.startsWith(INLINE_SITE_PREFIX)).map(key=>({origin:inlineOrigin(key.slice(INLINE_SITE_PREFIX.length)),...readInlineOptions(stored[key])})).sort((a,b)=>a.origin.localeCompare(b.origin));
  return {defaults,sites};
}
async function notifyInline(origin?:string,passive=true){
  void chrome.runtime.sendMessage({type:'inlineSettingsChanged'}).catch(()=>{});
  const tabs=await chrome.tabs.query({});
  await Promise.all(tabs.filter(tab=>tab.id).map(tab=>chrome.tabs.sendMessage(tab.id!,{type:'inlineConfigChanged',origin,passive}).catch(()=>{})));
  // Preference changes cancel only automatic requests whose effective options changed.
  for(const [controller,run] of automaticRuns){
    if(origin&&origin!==run.origin)continue;
    const prefs=await effectiveInline(run.origin);
    if(!prefs.autoCheck||prefs.includeStyle!==run.includeStyle)controller.abort();
  }
}
function changeInline(msg:any,origin?:string,passive=true){
  const operation=inlineQueue.catch(()=>{}).then(async()=>{
    const stored=await chrome.storage.local.get(INLINE_DEFAULTS_KEY),old=readInlineDefaults(stored[INLINE_DEFAULTS_KEY]);
    if(passive&&msg.revision!==old.revision)throw new Error('检查设置已在其他窗口更新，请重新载入后再保存。');
    if(old.revision>=Number.MAX_SAFE_INTEGER)throw new Error('自动检查设置无法读取，未覆盖原有数据。');
    const next={...old,revision:old.revision+1};
    if(msg.action==='defaults')Object.assign(next,readInlineOptions(msg));
    else if(msg.action==='site'){
      origin=inlineOrigin(origin);const options=readInlineOptions(msg);
      await chrome.storage.local.set({[INLINE_SITE_PREFIX+origin]:options});
    }else if(msg.action==='resetSite'){
      origin=inlineOrigin(origin);await chrome.storage.local.remove(INLINE_SITE_PREFIX+origin);
    }else throw new Error('未知操作。');
    await chrome.storage.local.set({[INLINE_DEFAULTS_KEY]:next});
    await notifyInline(origin,passive);
    return passive?inlineSettings():effectiveInline(origin!);
  });inlineQueue=operation;return operation;
}
async function presetState() { await ready; return readPresets((await chrome.storage.local.get('rewritePresets')).rewritePresets); }
async function notifyPresets() {
  await chrome.runtime.sendMessage({type:'presetsChanged'}).catch(()=>{});
  const tabs=await chrome.tabs.query({});
  await Promise.all(tabs.filter(t=>t.id).map(t=>chrome.tabs.sendMessage(t.id!,{type:'presetsChanged'}).catch(()=>{})));
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  (async () => {
    if (msg.type === 'config') return publicConfig();
    if(['inlineConfig','setInlineConfig','resetInlineConfig'].includes(msg.type)) {
      await ready;await presetSender(sender);await inlineQueue.catch(()=>{});const old=await inlinePreference(sender);
      if(msg.type==='inlineConfig')return old;
      return changeInline({...msg,action:msg.type==='resetInlineConfig'?'resetSite':'site'},old.origin,false);
    }
    if(msg.type==='dictionaryState'||msg.type==='dictionaryAction'){
      await ready;await presetSender(sender);
      if(msg.type==='dictionaryState'){await dictionaryQueue.catch(()=>{});return dictionaryState();}
      if(msg.action!=='add'&&sender.url?.split(/[?#]/)[0]!==chrome.runtime.getURL('options.html'))throw new Error('此操作只能从扩展设置页执行。');
      const operation=dictionaryQueue.catch(()=>{}).then(async()=>{
        const old=await dictionaryState(),next=updateDictionary(old,msg);
        if(next!==old){await chrome.storage.local.set({[DICTIONARY_KEY]:next});void notifyDictionary();}
        return next;
      });dictionaryQueue=operation;return operation;
    }
    if (msg.type === 'presetState' || msg.type === 'presetAction') {
      await ready; await presetSender(sender);
      if (msg.type === 'presetState') return presetState();
      const operation=presetQueue.catch(()=>{}).then(async()=>{
        const next=updatePresets(await presetState(),msg,crypto.randomUUID());
        await chrome.storage.local.set({rewritePresets:next});void notifyPresets();return next;
      });
      presetQueue=operation;return operation;
    }
    if (msg.type === 'options') {
      if(msg.section==='presets'){
        const url=chrome.runtime.getURL('options.html');
        const tabs=await chrome.tabs.query({}),existing=tabs.find(t=>t.id&&t.url?.split(/[?#]/)[0]===url);
        if(existing?.id){
          const response=await chrome.runtime.sendMessage({type:'navigatePresetSettings',tabId:existing.id}).catch(()=>undefined);
          if(response?.tabId!==existing.id)await chrome.tabs.update(existing.id,{url:url+'#presets'});
          await chrome.tabs.update(existing.id,{active:true});await chrome.windows.update(existing.windowId,{focused:true});
        }else await chrome.tabs.create({url:url+'#presets'});
      }else await chrome.runtime.openOptionsPage();
      return { ok: true };
    }
    if (!trusted(sender)) throw new Error('此操作只能从扩展设置页执行。');
    if(msg.type==='inlineSettings'){await inlineQueue.catch(()=>{});return inlineSettings();}
    if(msg.type==='inlineSettingsAction'){if(sender.url?.split(/[?#]/)[0]!==chrome.runtime.getURL('options.html'))throw new Error('此操作只能从扩展设置页执行。');return changeInline(msg,msg.action==='defaults'?undefined:inlineOrigin(msg.origin));}
    if(msg.type === 'serviceConfig')return publicConfig(msg.profileId);
    // Guide navigation changes metadata only; do not abort requests or refresh credentials.
    if(['onboardingProgress','completeOnboarding','restartOnboarding','dismissOnboarding','writingIntroProgress','dismissWritingIntro'].includes(msg.type)){
      const operation=stateQueue.catch(()=>{}).then(async()=>{await ready;return serviceAction(msg);});stateQueue=operation;return operation;
    }
    if (['save','unlock','lock','deleteKey','createProfile','deleteProfile','activateProfile','setUiLanguage'].includes(msg.type)) return mutateState(() => credentialAction(msg));
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
  if (!['lingo-task','lingo-check'].includes(port.name) || port.sender?.id !== chrome.runtime.id) { port.disconnect(); return; }
  const sender = port.sender;
  if (!trusted(sender) && (!sender.tab || !/^https?:/.test(sender.url || ''))) { port.disconnect(); return; }
  let controller: AbortController | null = null;
  let closed = false;
  const send = (event: object) => { if (!closed) try { port.postMessage(event); } catch {} };
  port.onDisconnect.addListener(() => { closed = true; controller?.abort(); });
  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'cancel') { controller?.abort(); return; }
    if (msg.type !== 'run' || controller) return;
    const checking=port.name==='lingo-check';
    const task = msg.task as Task & CheckTask;
    controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      await stateQueue.catch(() => {});
      const epoch = credentialEpoch;
      if(msg.profileId && sender.url?.split(/[?#]/)[0]!==chrome.runtime.getURL('options.html'))throw new Error('此操作只能从扩展设置页执行。');
      const c = await config(msg.profileId);
      if (epoch !== credentialEpoch || closed) throw new Error('设置已变化，请重新操作。');
      if (!c.dataConsent) throw new Error('请先在设置中确认将选中文字发送给所选服务的说明并保存。');
      if (c.deviceError) throw new Error('本机凭据无法读取，请重新填写 API Key 并保存。');
      if (!c.apiKey && c.vault) throw new Error('Key 已锁定，请在设置中输入本机解锁密码。');
      if (!c.apiKey) throw new Error('请先打开设置，填写你的 API Key。');
      if (!trusted(sender) && sender.tab && c.settings.blockedHosts.includes(new URL(sender.url!).hostname)) throw new Error('此站点已暂停 Lingo，请从扩展菜单重新启用。');
      if(checking&&msg.automatic===true){
        await inlineQueue.catch(()=>{});const prefs=await inlinePreference(sender);
        if(!prefs.autoCheck)throw new Error('此网站的自动检查已关闭。');
        if(prefs.includeStyle!==task.includeStyle)throw new Error('检查选项已变化，请重新检查。');
        automaticRuns.set(controller,{origin:prefs.origin,includeStyle:task.includeStyle});
      }
      if(checking)await dictionaryQueue.catch(()=>{});
      const request = checking?buildCheckRequest(task,c.settings.model,(await dictionaryState()).words):buildRequest(task, c.settings.model);
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
      if(checking&&msg.automatic===true){const prefs=await inlinePreference(sender);if(!prefs.autoCheck||prefs.includeStyle!==task.includeStyle||controller.signal.aborted)throw new Error('检查选项已变化，请重新检查。');}
      const res = await fetch(c.settings.baseUrl + '/responses', {
        redirect:'error', credentials:'omit', referrerPolicy:'no-referrer',
        method: 'POST', headers: { 'Authorization': `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: controller.signal
      });
      let raw='';
      await readResponses(res, text => {if(checking)raw+=text;else send({type:'delta', id:task.id, text});}, resetIdle);
      if(checking)send({type:'checked',id:task.id,...parseDiagnostics(raw,task.text,task.includeStyle)});
      else send({ type: 'done', id: task.id });
    } catch (e) {
      send({ type: 'error', id: task?.id, error: t(timedOut ? '请求超时，请稍后重试。' : controller.signal.aborted ? '已停止生成。' : e instanceof TypeError ? '网络连接失败，请检查网络后重试。' : (e as Error).message || '请求失败，请重试。') });
    } finally { clearTimeout(timeout); clearTimeout(idle); if (controller) {running.delete(controller);automaticRuns.delete(controller);} }
  });
});
