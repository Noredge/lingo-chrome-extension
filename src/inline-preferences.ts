export type InlineOptions={autoCheck:boolean;includeStyle:boolean};
export type TriggerVisibility='issues'|'never'|'always';
export type InlineDefaults=InlineOptions&{version:1;revision:number;triggerVisibility:TriggerVisibility};
export type InlineSettings={defaults:InlineDefaults;sites:({origin:string}&InlineOptions)[]};
export const INLINE_DEFAULTS_KEY='inlineCheckDefaults';
export const INLINE_SITE_PREFIX='inlineCheck:';
export function readTriggerVisibility(value:unknown):TriggerVisibility {
  if(value===undefined)return 'issues';
  if(value==='issues'||value==='never'||value==='always')return value;
  throw new Error('检查按钮显示设置无法读取，未覆盖原有数据。');
}
export function readInlineOptions(value:unknown):InlineOptions {
  const v=value as InlineOptions;
  if(!v||typeof v.autoCheck!=='boolean'||typeof v.includeStyle!=='boolean')throw new Error('自动检查设置无法读取，未覆盖原有数据。');
  return {autoCheck:v.autoCheck,includeStyle:v.includeStyle};
}
export function readInlineDefaults(value:unknown):InlineDefaults {
  if(value===undefined)return {version:1,revision:0,autoCheck:false,includeStyle:false,triggerVisibility:'issues'};
  const v=value as InlineDefaults;
  if(!v||v.version!==1||!Number.isSafeInteger(v.revision)||v.revision<0)throw new Error('自动检查设置无法读取，未覆盖原有数据。');
  return {version:1,revision:v.revision,...readInlineOptions(v),triggerVisibility:readTriggerVisibility(v.triggerVisibility)};
}
export function resolveInlineOptions(defaults:InlineDefaults,site:unknown):InlineOptions&{inherited:boolean;triggerVisibility:TriggerVisibility} {
  return {...readInlineOptions(site===undefined?defaults:site),inherited:site===undefined,triggerVisibility:defaults.triggerVisibility};
}
export function inlineOrigin(value:unknown):string {
  if(typeof value!=='string')throw new Error('请输入有效的普通网页地址。');
  try {const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.origin!==value||url.username||url.password)throw 0;return url.origin;}
  catch {throw new Error('请输入有效的普通网页地址。');}
}
