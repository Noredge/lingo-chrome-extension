import './ui.css';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let tab: chrome.tabs.Tab | undefined, origin = '';
function status(text: string, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function refresh() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const c = await chrome.runtime.sendMessage({ type: 'config' });
  $('key-state').textContent = c.hasKey ? `已连接 · ${c.settings.model}` : '首次使用：请在设置中填写 API Key';
  const supported = !!tab?.url && /^https?:/.test(tab.url);
  if (supported) {
    const u = new URL(tab!.url!); origin = `${u.protocol}//${u.hostname}/*`; $('host').textContent = u.hostname;
    $('toggle').textContent = c.settings.blockedHosts.includes(u.hostname) ? '恢复此站点' : '暂停此站点';
    const has = await chrome.permissions.contains({ origins: [origin] });
    $('enable').textContent = has ? '已授权划词入口' : '在此网站启用划词'; $<HTMLButtonElement>('enable').disabled = has;
  } else {
    $('host').textContent = '此页面不支持';
    for (const id of ['open','enable','toggle']) $<HTMLButtonElement>(id).disabled = true;
    status('请打开普通网页后使用。');
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
