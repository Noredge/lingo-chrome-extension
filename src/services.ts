import {DEFAULTS,DEFAULT_BASE_URL,LANGUAGES,languagePreferences,normalizeBaseUrl,apiOrigin,validKey,type Settings} from './core';
import {encryptKey,decryptKey,type EncryptedKey} from './vault';
import {encryptDeviceKey,decryptDeviceKey,removeDeviceKey,type DeviceEnvelope} from './device-vault';
export type ServiceProfile = {id:string;name:string;baseUrl:string;model:string;storageMode:'device'|'encrypted'|'session';deviceKey?:DeviceEnvelope;encryptedKey?:EncryptedKey;dataConsent:boolean;credentialBaseUrl:string;consentBaseUrl:string};
type SessionKey = {apiKey:string;baseUrl:string};
const legacyFields=['apiKey','encryptedKey','deviceKey','keyStorageMode','dataConsent','credentialBaseUrl','consentBaseUrl'];
export const serviceReady = Promise.all([
  chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})
]).then(async()=>{
  const local:any=await chrome.storage.local.get(null),session:any=await chrome.storage.session.get(null);
  if(typeof local.onboardingComplete!=='boolean') {
    const existing=!!(local.settings || local.apiKey || local.encryptedKey || local.deviceKey || session.apiKey || Object.keys(session.serviceSessions || {}).length || local.serviceProfiles?.some((p:ServiceProfile)=>p.deviceKey || p.encryptedKey || p.dataConsent || p.name!=='OpenAI' || p.baseUrl!==DEFAULT_BASE_URL || p.model!==DEFAULTS.model));
    await chrome.storage.local.set({onboardingComplete:existing,onboardingStep:0});
  }
  if(!Array.isArray(local.serviceProfiles) || !local.serviceProfiles.length) {
    const baseUrl=normalizeBaseUrl(local.settings?.baseUrl || DEFAULT_BASE_URL),id='default';
    const key=session.apiKey || local.apiKey || '';
    const storageMode=local.deviceKey?'device':local.encryptedKey?'encrypted':local.keyStorageMode || (key?'session':'device');
    const profile:ServiceProfile={id,name:baseUrl===DEFAULT_BASE_URL?'OpenAI':'My service',baseUrl,model:local.settings?.model || DEFAULTS.model,storageMode,credentialBaseUrl:local.credentialBaseUrl || DEFAULT_BASE_URL,consentBaseUrl:local.consentBaseUrl || DEFAULT_BASE_URL,dataConsent:local.dataConsent===1,...(local.deviceKey?{deviceKey:local.deviceKey}:{}),...(local.encryptedKey?{encryptedKey:local.encryptedKey}:{})};
    // Session first, then one atomic durable profile write. Legacy fields are deleted last.
    if(key)await chrome.storage.session.set({serviceSessions:{[id]:{apiKey:key,baseUrl:session.credentialBaseUrl || DEFAULT_BASE_URL}},legacyMigrated:!!local.apiKey || !!session.legacyMigrated});
    await chrome.storage.local.set({serviceProfiles:[profile],activeServiceId:id});
  }
  await chrome.storage.local.remove(legacyFields);
  await chrome.storage.session.remove(['apiKey','credentialBaseUrl']);
});
export async function serviceState(id?:string) {
  await serviceReady;
  const local:any=await chrome.storage.local.get(['settings','serviceProfiles','activeServiceId','apiOrigins','onboardingComplete','onboardingStep','onboardingDismissed','writingIntroVersion','writingIntroStep']);
  const session:any=await chrome.storage.session.get(['serviceSessions','legacyMigrated']);
  const profiles=local.serviceProfiles as ServiceProfile[];
  const profile=profiles.find(p=>p.id===(id || local.activeServiceId));
  if(!profile)throw new Error('找不到这套服务配置，请重新选择。');
  const baseUrl=normalizeBaseUrl(profile.baseUrl),cached=session.serviceSessions?.[profile.id] as SessionKey|undefined;
  let apiKey=cached?.baseUrl===baseUrl?cached.apiKey:'',deviceError=false;
  if(!apiKey&&profile.deviceKey) {try{apiKey=await decryptDeviceKey(profile.deviceKey,baseUrl);}catch{deviceError=true;}}
  return {writingIntroSeen:local.writingIntroVersion==='1.1',writingIntroStep:Math.min(5,Math.max(3,Number(local.writingIntroStep)||3)),onboardingDismissed:local.onboardingDismissed===true,onboardingComplete:local.onboardingComplete===true,onboardingStep:Math.min(5,Math.max(0,Number(local.onboardingStep)||0)),profile,profiles,activeServiceId:local.activeServiceId,apiOrigins:local.apiOrigins || [],sessions:session.serviceSessions || {},settings:{...DEFAULTS,...local.settings,...languagePreferences(local.settings || {}),baseUrl,model:profile.model} as Settings,apiKey,deviceError,deviceVault:profile.deviceKey,vault:profile.encryptedKey,storageMode:profile.storageMode,remember:!!profile.encryptedKey,credentialBaseUrl:profile.credentialBaseUrl,dataConsent:profile.dataConsent&&profile.consentBaseUrl===baseUrl,migrated:!!session.legacyMigrated};
}
export async function publicServiceConfig(id?:string) {
  const c=await serviceState(id);
  return {writingIntroSeen:c.writingIntroSeen,writingIntroStep:c.writingIntroStep,onboardingDismissed:c.onboardingDismissed,onboardingComplete:c.onboardingComplete,onboardingStep:c.onboardingStep,profileId:c.profile.id,profileName:c.profile.name,activeServiceId:c.activeServiceId,profiles:c.profiles.map(p=>({id:p.id,name:p.name,baseUrl:p.baseUrl,model:p.model,storageMode:p.storageMode})),apiOrigins:c.apiOrigins,settings:c.settings,hasKey:!!c.apiKey,hasVault:!!c.vault,remember:c.remember,storageMode:c.storageMode,deviceError:c.deviceError,dataConsent:c.dataConsent,migrated:c.migrated};
}
async function persistProfile(profile:ServiceProfile,c:Awaited<ReturnType<typeof serviceState>>,extra:object={}) {
  await chrome.storage.local.set({serviceProfiles:c.profiles.map(p=>p.id===profile.id?profile:p),...extra});
}
async function discardUnusedDeviceKey(profiles:ServiceProfile[]) { if(!profiles.some(p=>p.deviceKey))await removeDeviceKey(); }
// The background serializes every mutation and aborts old requests before entering this function.
export async function serviceAction(msg:any) {
  const c=await serviceState(msg.profileId),p=c.profile,id=p.id;
  const sessionSet=async(apiKey?:string,baseUrl=p.baseUrl)=>{const sessions={...c.sessions};if(apiKey)sessions[id]={apiKey,baseUrl};else delete sessions[id];await chrome.storage.session.set({serviceSessions:sessions});};
  if(msg.type==='writingIntroProgress'){
    if(!Number.isInteger(msg.step)||msg.step<3||msg.step>5)throw new Error('无效的设置步骤。');
    await chrome.storage.local.set({writingIntroStep:msg.step});return publicServiceConfig(id);
  }
  if(msg.type==='dismissWritingIntro'){
    await chrome.storage.local.set({writingIntroVersion:'1.1',writingIntroStep:3});return publicServiceConfig(id);
  }
  if(msg.type==='onboardingProgress') {
    if(!Number.isInteger(msg.step)||msg.step<0||msg.step>5)throw new Error('无效的设置步骤。');
    await chrome.storage.local.set({onboardingStep:msg.step});return publicServiceConfig(id);
  }
  if(msg.type==='dismissOnboarding') {
    await chrome.storage.local.set({onboardingDismissed:true});return publicServiceConfig();
  }
  if(msg.type==='restartOnboarding') {
    await chrome.storage.local.set({onboardingComplete:false,onboardingDismissed:false,onboardingStep:c.onboardingComplete?0:c.onboardingStep});return publicServiceConfig();
  }
  if(msg.type==='completeOnboarding') {
    await chrome.storage.local.set({onboardingComplete:true,onboardingDismissed:false,writingIntroVersion:'1.1',writingIntroStep:3});return publicServiceConfig(id);
  }
  if(msg.type==='setUiLanguage') {
    if(!['auto','en','zh-CN','zh-TW'].includes(msg.uiLanguage))throw new Error('请选择有效的界面语言。');
    await chrome.storage.local.set({settings:{...c.settings,uiLanguage:msg.uiLanguage}});return publicServiceConfig(id);
  }
  if(msg.type==='createProfile') {
    if(c.profiles.length>=20)throw new Error('最多保存 20 套服务配置。');
    const profile:ServiceProfile={id:crypto.randomUUID(),name:'New service',baseUrl:DEFAULT_BASE_URL,model:DEFAULTS.model,storageMode:'device',credentialBaseUrl:DEFAULT_BASE_URL,consentBaseUrl:DEFAULT_BASE_URL,dataConsent:false};
    await chrome.storage.local.set({serviceProfiles:[...c.profiles,profile]});return publicServiceConfig(profile.id);
  }
  if(msg.type==='activateProfile') {await chrome.storage.local.set({activeServiceId:id});return publicServiceConfig(id);}
  if(msg.type==='deleteProfile') {
    const profiles=c.profiles.filter(x=>x.id!==id);let activeServiceId=c.activeServiceId;
    // Removing the active connection never silently activates another saved provider.
    if(activeServiceId===id){const blank:ServiceProfile={id:crypto.randomUUID(),name:'OpenAI',baseUrl:DEFAULT_BASE_URL,model:DEFAULTS.model,storageMode:'device',credentialBaseUrl:DEFAULT_BASE_URL,consentBaseUrl:DEFAULT_BASE_URL,dataConsent:false};profiles.unshift(blank);activeServiceId=blank.id;}
    await chrome.storage.local.set({serviceProfiles:profiles,activeServiceId});await sessionSet();await discardUnusedDeviceKey(profiles);return publicServiceConfig();
  }
  if(msg.type==='lock') {
    if(p.storageMode==='device')throw new Error('免解锁模式不使用密码锁定；请删除 Key，或改为加密保存。');
    await sessionSet();return publicServiceConfig(id);
  }
  if(msg.type==='deleteKey') {
    const profile={...p};delete profile.deviceKey;delete profile.encryptedKey;
    await persistProfile(profile,c);await sessionSet();await discardUnusedDeviceKey(c.profiles.map(x=>x.id===id?profile:x));return publicServiceConfig(id);
  }
  if(msg.type==='unlock') {
    if(!p.encryptedKey)throw new Error('尚未加密保存 Key。');
    const key=await decryptKey(p.encryptedKey,msg.password,p.baseUrl);if(!validKey(key))throw new Error('加密数据中的 Key 格式不正确，请重新保存。');await sessionSet(key);return publicServiceConfig(id);
  }
  const name=msg.name ?? p.name;
  if(typeof name!=='string'||!name.trim()||name.trim().length>60)throw new Error('请填写 1–60 个字符的配置名称。');
  if(typeof msg.model!=='string'||!/^[\x21-\x7e]{1,160}$/.test(msg.model)||!LANGUAGES.includes(msg.language))throw new Error('请填写有效模型名称并选择目标语言。');
  const languages=msg.languages ?? c.settings.languages,uiLanguage=msg.uiLanguage ?? c.settings.uiLanguage;
  if(!['auto','en','zh-CN','zh-TW'].includes(uiLanguage))throw new Error('请选择有效的界面语言。');
  if(!Array.isArray(languages)||!languages.length||languages.length>LANGUAGES.length||languages.some(l=>typeof l!=='string'||!LANGUAGES.includes(l))||!languages.includes(msg.language))throw new Error('请至少保留一种浮窗语言，并从中选择默认语言。');
  const baseUrl=normalizeBaseUrl(msg.baseUrl ?? p.baseUrl),baseChanged=baseUrl!==p.baseUrl;
  if(baseChanged&&!validKey(msg.key?.trim())&&(c.apiKey||p.encryptedKey||p.deviceKey))throw new Error('更换服务地址时，请填写该服务的新 Key。旧 Key 不会转发到新地址。');
  if(!await chrome.permissions.contains({origins:[apiOrigin(baseUrl)]}))throw new Error('请先授权连接此 API 服务。');
  let apiKey=c.apiKey;
  if(msg.key!==undefined&&msg.key!=='') {if(typeof msg.key!=='string'||!validKey(msg.key.trim()))throw new Error('Key 格式不正确，请完整粘贴服务商提供的 API Key（8–512 个字符）。');apiKey=msg.key.trim();}
  const mode=msg.storageMode ?? (msg.remember?'encrypted':'session');
  if(!['device','encrypted','session'].includes(mode))throw new Error('请选择有效的 Key 保存方式。');
  if(!apiKey&&mode!==p.storageMode&&(p.encryptedKey||p.deviceKey))throw new Error(p.encryptedKey?'请先解锁已保存的 Key，或填写新 Key，再更改保存方式。':'本机凭据无法读取，请先重新填写 Key，或删除此配置。');
  let vault=p.encryptedKey;
  if(mode==='encrypted'&&(apiKey||msg.password)&&(!vault||msg.key||msg.password||baseChanged)) {
    if(!apiKey)throw new Error('请先填写 Key 或解锁已保存的 Key。');
    if(typeof msg.password!=='string'||msg.password!==msg.passwordConfirm)throw new Error('两次解锁密码不一致。');
    vault=await encryptKey(apiKey,msg.password,baseUrl);
  }
  const deviceKey=mode==='device'?(apiKey?await encryptDeviceKey(apiKey,baseUrl):p.deviceKey):undefined;
  const profile:ServiceProfile={id,name:name.trim(),baseUrl,model:msg.model,storageMode:mode,credentialBaseUrl:baseUrl,consentBaseUrl:baseUrl,dataConsent:msg.dataConsent===true,...(mode==='device'&&deviceKey?{deviceKey}:{}),...(mode==='encrypted'&&vault?{encryptedKey:vault}:{})};
  const settings={...c.settings,uiLanguage,language:msg.language,languages:[...new Set<string>(languages)]};
  await persistProfile(profile,c,{settings,...(msg.activate===true?{activeServiceId:id}:{}),apiOrigins:[...new Set([...c.apiOrigins,apiOrigin(baseUrl)])]});
  await sessionSet(apiKey||undefined,baseUrl);await chrome.storage.session.remove('legacyMigrated');await discardUnusedDeviceKey(c.profiles.map(x=>x.id===id?profile:x));
  return publicServiceConfig(id);
}
