import './ui.css';
import {prefersSidebar} from './surfaces';
import {localize, setLanguage} from './i18n';
localize(document);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let tab: chrome.tabs.Tab | undefined, origin = '';
let panelWindowId:number|undefined;
void chrome.windows.getCurrent().then(w=>{panelWindowId=w.id;$<HTMLButtonElement>('open-panel').disabled=panelWindowId===undefined;}).catch(()=>status('无法打开面板，请重新打开插件菜单。',true));
$('open-panel').addEventListener('click',()=>{
  if(panelWindowId===undefined)return;
  // Call directly in the click gesture; no site injection or clipboard read is needed.
  void chrome.sidePanel.open({windowId:panelWindowId}).then(()=>window.close()).catch(()=>status('无法打开面板，请重新打开插件菜单。',true));
});
function status(text: string, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function refresh() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const c = await chrome.runtime.sendMessage({ type: 'config' }); setLanguage(c.settings.uiLanguage);
  $('key-state').textContent = !c.dataConsent ? '请在设置中确认数据处理说明' : c.hasKey ? `Key 已就绪 · ${c.settings.model}` : c.hasVault ? 'Key 已锁定，请打开设置解锁' : '首次使用：请在设置中填写 API Key';
  const sidebarOnly=prefersSidebar(tab?.url||'');
  $('open').hidden=sidebarOnly;
  $('open-panel').classList.toggle('primary',sidebarOnly);
  document.querySelector<HTMLElement>('.actions')!.hidden=sidebarOnly;
  if(sidebarOnly)status('此页面使用侧边栏；粘贴原文，或选中文字后右键翻译。');
  const supported = !!tab?.url && /^https?:/.test(tab.url);
  if (supported) {
    const u = new URL(tab!.url!); origin = `${u.protocol}//${u.hostname}/*`; $('host').textContent = u.hostname;
    $('toggle').textContent = c.settings.blockedHosts.includes(u.hostname) ? '恢复此站点' : '暂停此站点';
    const has = await chrome.permissions.contains({ origins: [origin] });
    $('enable').textContent = has ? '已授权划词入口' : '在此网站启用划词'; $<HTMLButtonElement>('enable').disabled = has;
  } else {
    $('host').textContent = '此页面不支持划词';
    for (const id of ['open','enable','toggle']) $<HTMLButtonElement>(id).disabled = true;
    status('可打开面板，粘贴文字进行翻译和修改。');
  }
}
void refresh().catch(() => status('无法读取当前页，请重新打开扩展。', true));
$('settings').addEventListener('click', () => { void chrome.runtime.openOptionsPage(); });
$('open').addEventListener('click', async () => {
  const r = await chrome.runtime.sendMessage({ type: 'openActive' });
  if (r.ok) window.close(); else status(r.error || '请先选中文字。', true);
});
$('enable').addEventListener('click', async () => {
  if (!origin) return;
  try {
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) { status('未授权；可以用上方按钮临时打开。'); return; }
    await chrome.runtime.sendMessage({ type: 'syncSites' });
    if (tab?.id) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await refresh(); status('已启用。关闭菜单，重新划选文字即可。');
  } catch { status('此页面无法注入扩展，请刷新或换一个普通网页。', true); }
});
$('toggle').addEventListener('click', async () => { const r = await chrome.runtime.sendMessage({ type: 'toggleSite' }); if (r.error) status(r.error, true); else { await refresh(); status('站点设置已更新。'); } });
