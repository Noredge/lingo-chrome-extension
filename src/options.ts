import './ui.css';
import { localize, setLanguage, t } from './i18n';
import { LANGUAGES, DEFAULTS, normalizeBaseUrl, apiOrigin } from './core';
document.querySelector('.version')!.textContent = chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version;
localize(document);
const base = document.getElementById('base-url') as HTMLInputElement;
const ui = document.getElementById('ui-language') as HTMLSelectElement;
let savedBase = '', savedModel = '', savedName = '', allGranted = false, profileId = '', activeProfileId = '';
const profileSelect = document.getElementById('profile') as HTMLSelectElement;
const profileName = document.getElementById('profile-name') as HTMLInputElement;
function destination() { try { document.getElementById('destination')!.textContent = t('数据传送到：') + normalizeBaseUrl(base.value) + '/responses'; } catch { document.getElementById('destination')!.textContent = t('请检查 Base URL。'); } }
base.addEventListener('input', () => { destination(); if (base.value.replace(/\/$/,'') !== savedBase) { document.getElementById('data-consent')!.removeAttribute('checked'); (document.getElementById('data-consent') as HTMLInputElement).checked = false; } });
ui.addEventListener('change', () => {setLanguage(ui.value);destination();void message({type:'setUiLanguage',uiLanguage:ui.value}).catch(e=>status(onboarding?'setup-status':'save-status',e.message,true));});
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const key = $<HTMLInputElement>('api-key'), model = $<HTMLInputElement>('model'), language = $<HTMLSelectElement>('language'), storageMode = $<HTMLSelectElement>('storage-mode');
let selectedLanguages = [...DEFAULTS.languages], savedForm = '', loaded = false;
let onboarding=false, setupComplete=false, setupStep=0, knownKey=false, setupBusy=false;
const localeHome=document.querySelector('.page-head')!;
const localeControl=document.querySelector('.locale-control')!;
const setupDialog=$<HTMLDialogElement>('setup-dialog'),settingsForm=$('settings-form'),accessCard=$('website-access');
const formHome=document.createComment('settings form'),accessHome=document.createComment('website access');
settingsForm.before(formHome);accessCard.before(accessHome);
function formState(){return JSON.stringify([profileName.value.trim(),base.value,model.value.trim(),key.value,storageMode.value,$<HTMLInputElement>('vault-password').value,$<HTMLInputElement>('vault-confirm').value,$<HTMLInputElement>('data-consent').checked,language.value,selectedLanguages]);}
function edited(){return loaded && formState()!==savedForm;}
function dirty(){return loaded && (edited() || profileId!==activeProfileId);}
function updateDirty(){ $('save-bar').hidden=!dirty();$('save-settings').textContent=profileId===activeProfileId?'保存设置':'保存并使用此配置';}
$('settings-form').addEventListener('input',updateDirty);$('settings-form').addEventListener('change',updateDirty);
window.addEventListener('beforeunload',e=>{if(edited()){e.preventDefault();e.returnValue='';}});
function drawLanguages(preferred = language.value) {
  language.replaceChildren(); $('language-list').replaceChildren();
  for (const l of selectedLanguages) {
    const o = document.createElement('option'); o.value = l; o.textContent = l.split('（')[0]; o.translate = false; language.append(o);
    const chip = document.createElement('span'); chip.className = 'language-chip';
    const text = document.createElement('span'); text.textContent = l.split('（')[0]; text.translate = false;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `移除 ${l}`); remove.disabled = selectedLanguages.length === 1;
    remove.addEventListener('click', () => { const current = language.value; selectedLanguages = selectedLanguages.filter(x => x !== l); drawLanguages(current);updateDirty(); });
    chip.append(text, remove); $('language-list').append(chip);
  }
  language.value = selectedLanguages.includes(preferred) ? preferred : selectedLanguages[0];
  const add = $<HTMLSelectElement>('add-language'); add.replaceChildren();
  LANGUAGES.filter(l => !selectedLanguages.includes(l)).forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l.split('（')[0]; o.translate = false; add.append(o); });
  add.disabled = selectedLanguages.length === LANGUAGES.length;
  $<HTMLButtonElement>('add-language-button').disabled = add.disabled;
}
$('add-language-button').addEventListener('click', () => {
  const value = $<HTMLSelectElement>('add-language').value;
  if (value && !selectedLanguages.includes(value)) { selectedLanguages.push(value); drawLanguages();updateDirty(); }
});
async function message(data: object) { const result = await chrome.runtime.sendMessage(data); if (result.error) throw new Error(result.error); return result; }
function status(id: string, text: string, error = false) { $(id).textContent = text; $(id).classList.toggle('error', error); }
function clearCredentialInputs() {
  for (const id of ['api-key','vault-password','vault-confirm','unlock-password']) $<HTMLInputElement>(id).value = '';
  key.type = 'password'; $('reveal').textContent = '显示';
}
function drawStorage() {
  const mode = storageMode.value;
  $('password-fields').hidden = mode !== 'encrypted';
  $('device-disclosure').hidden = mode !== 'device';
  $('storage-help').textContent = mode === 'device' ? '保存一次，重启 Chrome 后也可直接使用，无需解锁。' : mode === 'encrypted' ? '重启 Chrome 或重载扩展后解锁一次，之后的划词与打开浮窗都不需要重复输入密码。' : '关闭浏览器或重载扩展后，需要重新填写 Key。';
}
function draw(c: any) {
  knownKey=c.hasKey;setupComplete=c.onboardingComplete;onboarding=!c.onboardingComplete&&!c.onboardingDismissed;setupStep=c.onboardingStep;
  profileId=c.profileId;activeProfileId=c.activeServiceId;profileName.value=savedName=c.profileName;
  profileSelect.replaceChildren(...c.profiles.map((p:any)=>{const o=new Option(p.name,p.id);o.translate=false;return o;}));profileSelect.value=profileId;
  const active=c.profiles.find((p:any)=>p.id===activeProfileId);const prefix=document.createElement('span');prefix.textContent='当前使用：';const activeName=document.createElement('span');activeName.translate=false;activeName.textContent=active?.name || '';$('active-profile').replaceChildren(prefix,activeName);

  base.value = savedBase = c.settings.baseUrl; savedModel = c.settings.model; ui.value = c.settings.uiLanguage; setLanguage(ui.value); destination();
  model.value = c.settings.model; selectedLanguages = [...c.settings.languages]; drawLanguages(c.settings.language); storageMode.value = c.storageMode;
  $('key-status').textContent = c.hasKey ? 'Key 已配置' : c.hasVault ? 'Key 已锁定' : '尚未配置 Key'; $('key-status').classList.toggle('connected', c.hasKey);
  key.placeholder = c.hasKey || c.hasVault ? '已保存 · 留空保留，输入新 Key 可替换' : 'API Key';
  $('key-hint').textContent=c.deviceError?'本机凭据无法读取，请重新填写 API Key 并保存。':c.hasVault&&!c.hasKey?'Key 已锁定':c.hasKey?'Key 已配置':'Key 与此服务地址绑定。';
  $('migration-note').hidden = !c.migrated;
  $('unlock-section').hidden = !c.hasVault || c.hasKey;
  drawStorage();
  $<HTMLButtonElement>('lock-key').disabled = !c.hasKey || c.storageMode === 'device';
  $('lock-key').hidden = c.storageMode === 'device';
  $<HTMLInputElement>('data-consent').checked = c.dataConsent;
  $('blocked').replaceChildren();
  if (c.settings.blockedHosts.length) {
    const title = document.createElement('p'); title.className = 'help'; title.textContent = '已暂停的站点'; $('blocked').append(title);
    for (const host of c.settings.blockedHosts) {
      const row = document.createElement('div'); row.className = 'site-item'; const name = document.createElement('span'); name.textContent = host;
      const b = document.createElement('button'); b.textContent = '恢复'; b.addEventListener('click', () => { void message({ type: 'unblock', host }).then(load).catch(e => status('site-status', e.message, true)); });
      row.append(name, b); $('blocked').append(row);
    }
  }
  loaded=true;savedForm=formState();updateDirty();renderSetup();
}
async function load() { draw(await message({ type:profileId?'serviceConfig':'config',profileId:profileId||undefined })); await sites(); }
function renderSetup(){
  document.body.classList.toggle('onboarding',onboarding);
  $('setup-restart').hidden=onboarding;$('setup-restart').textContent=setupComplete?'查看设置引导':'继续设置引导';
  if(onboarding){$('setup-service-slot').append(settingsForm);$('setup-access-slot').append(accessCard);}
  else{formHome.after(settingsForm);accessHome.after(accessCard);}
  $('setup-head').hidden=$('setup-nav').hidden=$('setup-status').hidden=!onboarding;
  $('setup-language').hidden=!onboarding || setupStep!==0;
  $('service-card').hidden=onboarding && setupStep!==1;
  $('website-access').hidden=onboarding && setupStep!==2;
  document.querySelectorAll<HTMLElement>('.setup-only').forEach(el=>el.hidden=!onboarding);
  (onboarding?$('setup-locale-slot'):localeHome).append(localeControl);
  document.querySelectorAll('.setup-steps li').forEach((el,i)=>{if(i===setupStep)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  $('setup-back').hidden=setupStep===0;
  $('setup-skip').hidden=setupStep!==1;
  $('setup-next').textContent=setupStep===0?'下一步':setupStep===1?'保存并继续':'完成设置';
  $('test').textContent=onboarding?'保存并测试连接':'测试连接';
  $('test-help').textContent=onboarding?'发送一句固定示例，检查连接是否可用。':'使用已保存的连接。';
  $('service-title').textContent=onboarding?'连接你的 API':'服务配置';
  drawSitePermission();
  document.querySelector<HTMLElement>('.settings-layout')!.hidden=false;
  if(onboarding && !setupDialog.open){setupDialog.showModal();$('setup-title').focus();}
  if(!onboarding && setupDialog.open)setupDialog.close();
}
async function goStep(step:number){
  stopTest();
  await message({type:'onboardingProgress',step});setupStep=step;renderSetup();status('setup-status','');
  $('setup-title').focus();setupDialog.scrollTop=0;
}
async function setupAction(action:()=>Promise<void>){
  if(setupBusy)return;setupBusy=true;$('setup-nav').inert=true;
  try{await action();}catch(e){status('setup-status',(e as Error).message,true);}finally{setupBusy=false;$('setup-nav').inert=false;}
}
$('setup-back').addEventListener('click',()=>void setupAction(()=>goStep(setupStep-1)));
$('setup-skip').addEventListener('click',()=>void setupAction(async()=>{
  if(!discardDraft())return;clearCredentialInputs();draw(await message({type:'config'}));await goStep(2);
}));
$('setup-next').addEventListener('click',()=>{
  if(setupStep===1){$<HTMLFormElement>('settings-form').requestSubmit();return;}
  void setupAction(async()=>{
    if(setupStep===0){await message({type:'setUiLanguage',uiLanguage:ui.value});await goStep(1);}
    else{stopTest();draw(await message({type:'completeOnboarding'}));status('save-status','设置完成，可以开始使用 Lingo。');window.scrollTo(0,0);document.querySelector<HTMLElement>('.page-head h2')!.setAttribute('tabindex','-1');document.querySelector<HTMLElement>('.page-head h2')!.focus();}
  });
});
void load().catch(e => {document.querySelector<HTMLElement>('.settings-layout')!.hidden=false;status('save-status', e.message, true);});
async function saveConnection():Promise<boolean> {
  const b=$<HTMLButtonElement>('save-settings'),form=$('settings-form');b.disabled=true;form.inert=true;$('setup-nav').inert=true;stopTest();
  try { const normalized = normalizeBaseUrl(base.value);
    if(onboarding && !key.value.trim() && !knownKey)throw new Error('请填写 API Key，或选择稍后配置。');
    if(onboarding && !$<HTMLInputElement>('data-consent').checked)throw new Error('请同意将选中文字发送给此服务。');
    const granted = await chrome.permissions.request({origins:[apiOrigin(normalized)]});
    if (!granted) throw new Error('未授权 API 服务，设置未保存。');
    const c = await message({ type: 'save', profileId, activate:true, name:profileName.value.trim(), baseUrl:normalized, uiLanguage:ui.value, key: key.value.trim(), model: model.value.trim(), language: language.value, languages: selectedLanguages, storageMode: storageMode.value, deviceConsent: storageMode.value === 'device', password: $<HTMLInputElement>('vault-password').value, passwordConfirm: $<HTMLInputElement>('vault-confirm').value, dataConsent: $<HTMLInputElement>('data-consent').checked }); clearCredentialInputs(); draw(c); status('save-status','已保存，当前使用此配置。');return true;
  } catch (e) { status('save-status', (e as Error).message, true);return false; } finally { b.disabled=false;form.inert=false;$('setup-nav').inert=false;updateDirty(); }
}
$('settings-form').addEventListener('submit', async e => {
  e.preventDefault();if(setupBusy)return;setupBusy=true;
  try{if(await saveConnection()){if(onboarding)await goStep(2);}}catch(e){status('save-status',(e as Error).message,true);}finally{setupBusy=false;}
});
storageMode.addEventListener('change', drawStorage);
$('unlock-key').addEventListener('click', async () => {
  const password = $<HTMLInputElement>('unlock-password'), button = $<HTMLButtonElement>('unlock-key'); button.disabled = true;
  try { draw(await message({type:'unlock',profileId,password:password.value})); status('save-status','已解锁，本次浏览器会话可用。'); }
  catch (e) { status('save-status',(e as Error).message,true); }
  finally { password.value = ''; button.disabled = false; }
});
$('unlock-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $<HTMLButtonElement>('unlock-key').click(); }
});
$('lock-key').addEventListener('click', async () => {
  try { const c=await message({type:'lock',profileId});clearCredentialInputs();draw(c); status('save-status','已清除会话中的 Key 并停止正在进行的请求。'); }
  catch(e) { status('save-status',(e as Error).message,true); }
});
$('reveal').addEventListener('click', () => { key.type = key.type === 'password' ? 'text' : 'password'; $('reveal').textContent = key.type === 'password' ? '显示' : '隐藏'; });
let testPort: chrome.runtime.Port | null = null;
$('test').addEventListener('click', async () => {
  if (testPort) { testPort.disconnect(); testPort = null; $('test').textContent = onboarding?'保存并测试连接':'测试连接'; status('save-status', '测试已停止。'); return; }
  if(onboarding){
    if(setupBusy || !$<HTMLFormElement>('settings-form').reportValidity())return;
    setupBusy=true;try{if(!await saveConnection())return;}finally{setupBusy=false;}
  }
  if (edited()) { status('save-status', '请先保存服务地址、模型和 Key，再测试连接。', true); return; }
  const port = chrome.runtime.connect({ name: 'lingo-task' }); testPort = port;
  let complete = false; let output = '';
  status('save-status', '正在使用已保存的模型翻译固定示例…'); $('test').textContent = '停止测试';
  const timer = setTimeout(() => { complete = true; status('save-status', '连接超时，请稍后再试。', true); finish(); }, 35000);
  const finish = () => { clearTimeout(timer); testPort = null; $('test').textContent = onboarding?'保存并测试连接':'测试连接'; port.disconnect(); };
  port.onMessage.addListener(event => {
    if (event.type === 'delta') output += event.text;
    if (event.type === 'done') { complete = true; status('save-status', `连接成功 · ${output}`); finish(); }
    if (event.type === 'error') { complete = true; status('save-status', event.error, true); finish(); }
  });
  port.onDisconnect.addListener(() => { clearTimeout(timer); if (testPort === port) { testPort = null; $('test').textContent = onboarding?'保存并测试连接':'测试连接'; if (!complete) status('save-status', '连接已中断，请重试。', true); } });
  port.postMessage({ type: 'run', profileId, task: { id: crypto.randomUUID(), text: 'A little clearer, a little better.', mode: 'translate', language: language.value } });
});
function drawSitePermission(){
  $('all-sites').textContent=allGranted?(onboarding?'已授权网页访问':'关闭所有网站授权'):'一键授权所有普通网页';
  $<HTMLButtonElement>('all-sites').disabled=onboarding && allGranted;
}
async function sites() {
  const p = await chrome.permissions.getAll();
  const c = await message({type:'config'});
  const origins = (p.origins || []).filter(x => /^https?:/.test(x) && x !== 'https://api.openai.com/*' && !(c.apiOrigins || []).includes(x));
  const all = origins.includes('https://*/*') && origins.includes('http://*/*'); allGranted = all;
  drawSitePermission();
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
    if (allGranted) {
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

function stopTest(){if(testPort){testPort.disconnect();testPort=null;} $('test').textContent=onboarding?'保存并测试连接':'测试连接';}
function discardDraft(){return !edited() || confirm(t('放弃尚未保存的更改？'));}
profileSelect.addEventListener('change',()=>{if(!discardDraft()){profileSelect.value=profileId;return;}stopTest();clearCredentialInputs();profileId=profileSelect.value;void load().then(()=>status('save-status','')).catch(e=>status('save-status',e.message,true));});
$('new-profile').addEventListener('click',async()=>{if(!discardDraft())return;try{stopTest();clearCredentialInputs();draw(await message({type:'createProfile'}));status('save-status','填写连接后，保存并使用。');}catch(e){status('save-status',(e as Error).message,true);}});
$('delete-profile').addEventListener('click',async()=>{
 if(!confirm(t('删除这套配置及其 Key？地址和模型也会一并移除。')))return;
 try{stopTest();clearCredentialInputs();draw(await message({type:'deleteProfile',profileId}));status('save-status','已删除配置及 Key。');}catch(e){status('save-status',(e as Error).message,true);}
});

$('setup-restart').addEventListener('click',()=>void setupAction(async()=>{stopTest();const c=await message({type:'restartOnboarding'});setupComplete=false;onboarding=true;setupStep=c.onboardingStep;renderSetup();$('setup-title').focus();setupDialog.scrollTop=0;}));

function dismissSetup(){void setupAction(async()=>{
  stopTest();await message({type:'dismissOnboarding'});onboarding=false;
  key.type='password';$('reveal').textContent='显示';renderSetup();updateDirty();
  const heading=document.querySelector<HTMLElement>('.page-head h2')!;heading.tabIndex=-1;heading.focus();
});}
$('setup-close').addEventListener('click',dismissSetup);
setupDialog.addEventListener('cancel',event=>{event.preventDefault();dismissSetup();});
