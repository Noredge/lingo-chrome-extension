export type InlineOptions={autoCheck:boolean;includeStyle:boolean};
export type InlineDefaults=InlineOptions&{version:1;revision:number};
export type InlineSettings={defaults:InlineDefaults;sites:({origin:string}&InlineOptions)[]};
export const INLINE_DEFAULTS_KEY='inlineCheckDefaults';
export const INLINE_SITE_PREFIX='inlineCheck:';
export function readInlineOptions(value:unknown):InlineOptions {
  const v=value as InlineOptions;
  if(!v||typeof v.autoCheck!=='boolean'||typeof v.includeStyle!=='boolean')throw new Error('自动检查设置无法读取，未覆盖原有数据。');
  return {autoCheck:v.autoCheck,includeStyle:v.includeStyle};
}
export function readInlineDefaults(value:unknown):InlineDefaults {
  if(value===undefined)return {version:1,revision:0,autoCheck:false,includeStyle:false};
  const v=value as InlineDefaults;
  if(!v||v.version!==1||!Number.isSafeInteger(v.revision)||v.revision<0)throw new Error('自动检查设置无法读取，未覆盖原有数据。');
  return {version:1,revision:v.revision,...readInlineOptions(v)};
}
export function resolveInlineOptions(defaults:InlineDefaults,site:unknown):InlineOptions&{inherited:boolean} {
  return {...readInlineOptions(site===undefined?defaults:site),inherited:site===undefined};
}
export function inlineOrigin(value:unknown):string {
  if(typeof value!=='string')throw new Error('请输入有效的普通网页地址。');
  try {const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.origin!==value||url.username||url.password)throw 0;return url.origin;}
  catch {throw new Error('请输入有效的普通网页地址。');}
}
