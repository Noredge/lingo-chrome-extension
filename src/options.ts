import './ui.css';
import { LANGUAGES } from './core';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const key = $<HTMLInputElement>('api-key'), model = $<HTMLInputElement>('model'), language = $<HTMLSelectElement>('language'), remember = $<HTMLInputElement>('remember');
LANGUAGES.forEach(l => { const o = document.createElement('option'); o.value = o.textContent = l; language.append(o); });
async function message(data: object) { const result = await chrome.runtime.sendMessage(data); if (result.error) throw new Error(result.error); return result; }
function status(id: string, text: string, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function draw(c: any) {
  model.value = c.settings.model; language.value = c.settings.language; remember.checked = c.remember;
  $('key-status').textContent = c.hasKey ? 'Key 已配置' : '尚未配置 Key'; $('key-status').classList.toggle('connected', c.hasKey);
  key.placeholder = c.hasKey ? '已保存 · 留空保留，输入新 Key 可替换' : 'sk-…';
  $('key-hint').textContent = c.hasKey ? `已保存在${c.remember ? '本机' : '本次浏览器会话'}。不会回显已有 Key。` : 'Key 仅在扩展后台使用，不会传给网页脚本。';
  $('blocked').replaceChildren();
  if (c.settings.blockedHosts.length) {
    const title = document.createElement('p'); title.className = 'help'; title.textContent = '已暂停的站点'; $('blocked').append(title);
    for (const host of c.settings.blockedHosts) {
      const row = document.createElement('div'); row.className = 'site-item'; const name = document.createElement('span'); name.textContent = host;
      const b = document.createElement('button'); b.textContent = '恢复'; b.addEventListener('click', () => { void message({ type: 'unblock', host }).then(load).catch(e => status('site-status', e.message, true)); });
      row.append(name, b); $('blocked').append(row);
    }
  }
}
async function load() { draw(await message({ type: 'config' })); await sites(); }
void load().catch(e => status('save-status', e.message, true));
$('settings-form').addEventListener('submit', async e => {
  e.preventDefault(); const b = document.querySelector<HTMLButtonElement>('button[type="submit"]')!; b.disabled = true;
  try { const c = await message({ type: 'save', key: key.value.trim(), model: model.value.trim(), language: language.value, remember: remember.checked }); key.value = ''; key.type = 'password'; $('reveal').textContent = '显示'; draw(c); status('save-status', '设置已保存。已打开的窗口可点击重试，或关闭后重新划词。'); }
  catch (e) { status('save-status', (e as Error).message, true); } finally { b.disabled = false; }
});
$('reveal').addEventListener('click', () => { key.type = key.type === 'password' ? 'text' : 'password'; $('reveal').textContent = key.type === 'password' ? '显示' : '隐藏'; });
$('delete-key').addEventListener('click', async () => {
  if (!confirm('删除此扩展保存的 Key？这不会撤销 OpenAI 平台上的密钥。')) return;
  try { draw(await message({ type: 'deleteKey' })); key.value = ''; status('save-status', '已删除扩展中的 Key。'); } catch (e) { status('save-status', (e as Error).message, true); }
});
let testPort: chrome.runtime.Port | null = null;
$('test').addEventListener('click', () => {
  if (testPort) { testPort.disconnect(); testPort = null; $('test').textContent = '测试连接'; status('save-status', '测试已停止。'); return; }
  if (key.value.trim()) { status('save-status', '请先保存新 Key，再测试连接。', true); return; }
  const port = chrome.runtime.connect({ name: 'lingo-task' }); testPort = port;
  let complete = false; let output = '';
  status('save-status', '正在使用已保存的模型翻译固定示例…'); $('test').textContent = '停止测试';
  const timer = setTimeout(() => { complete = true; status('save-status', '连接超时，请稍后再试。', true); finish(); }, 35000);
  const finish = () => { clearTimeout(timer); testPort = null; $('test').textContent = '测试连接'; port.disconnect(); };
  port.onMessage.addListener(event => {
    if (event.type === 'delta') output += event.text;
    if (event.type === 'done') { complete = true; status('save-status', `连接成功 · ${output}`); finish(); }
    if (event.type === 'error') { complete = true; status('save-status', event.error, true); finish(); }
  });
  port.onDisconnect.addListener(() => { clearTimeout(timer); if (testPort === port) { testPort = null; $('test').textContent = '测试连接'; if (!complete) status('save-status', '连接已中断，请重试。', true); } });
  port.postMessage({ type: 'run', task: { id: crypto.randomUUID(), text: 'A little clearer, a little better.', mode: 'translate', language: language.value } });
});
async function sites() {
  const p = await chrome.permissions.getAll();
  const origins = (p.origins || []).filter(x => /^https?:/.test(x) && x !== 'https://api.openai.com/*');
  const all = origins.includes('https://*/*') && origins.includes('http://*/*');
  $('all-sites').textContent = all ? '关闭所有网站授权' : '一键授权所有普通网页';
  $('permission-summary').textContent = all ? '已授权所有普通网页 · 划词即可使用' : origins.length ? '已授权部分站点 · 可开启所有普通网页' : '还差一步：授权网站后，划词才会自动出现入口';
  $('sites').replaceChildren();
  for (const origin of origins.filter(x => !['http://*/*','https://*/*'].includes(x))) {
    const row = document.createElement('div'); row.className = 'site-item'; const text = document.createElement('span'); text.textContent = origin;
    const b = document.createElement('button'); b.textContent = '移除'; b.addEventListener('click', async () => { await chrome.permissions.remove({ origins: [origin] }); await message({ type: 'syncSites' }); await sites(); status('site-status', '已移除授权，请刷新该站点已打开的页面。'); });
    row.append(text, b); $('sites').append(row);
  }
}
$('all-sites').addEventListener('click', async () => {
  try {
    if ($('all-sites').textContent?.startsWith('关闭')) {
      await chrome.permissions.remove({ origins: ['https://*/*','http://*/*'] });
      status('site-status', '已关闭所有网站授权，请刷新已打开的网页。');
    } else {
      const granted = await chrome.permissions.request({ origins: ['https://*/*','http://*/*'] });
      status('site-status', granted ? '已启用，请刷新网页后划选文字。' : '未授权；仍可从扩展菜单临时调用。');
    }
    await message({ type: 'syncSites' }); await sites();
  } catch (e) { status('site-status', (e as Error).message, true); }
});
$('site-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const url = new URL($<HTMLInputElement>('site-url').value);
    if (!['http:','https:'].includes(url.protocol)) throw new Error('请输入 HTTP 或 HTTPS 网站地址。');
    const granted = await chrome.permissions.request({ origins: [`${url.protocol}//${url.hostname}/*`] });
    await message({ type: 'syncSites' }); await sites();
    status('site-status', granted ? '站点已添加，请刷新网页后使用。' : '未授权该站点。');
  } catch (e) { status('site-status', (e as Error).message, true); }
});

chrome.permissions.onAdded.addListener(() => { void sites(); });
chrome.permissions.onRemoved.addListener(() => { void sites(); });
