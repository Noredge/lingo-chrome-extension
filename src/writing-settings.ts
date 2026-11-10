import {createDictionaryControls} from './dictionary-controls';
import {createPresetControls} from './preset-controls';
import type {InlineSettings,InlineDefaults} from './inline-preferences';

export function createWritingSettings(){
  const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const auto=$<HTMLInputElement>('global-auto'),style=$<HTMLInputElement>('global-style');
  const controls=$<HTMLFieldSetElement>('writing-controls');
  let state:InlineSettings|null=null,base:InlineDefaults|null=null,busy=false,refreshEpoch=0;
  const dictionary=createDictionaryControls();
  const presets=createPresetControls($('settings-presets'),{managementOnly:true,instruction:()=>'',changed:()=>{}});
  function status(text:string,error=false,site=false){const output=$(site?'site-overrides-status':'writing-status');output.textContent=text;output.classList.toggle('error',error);}
  const dirty=()=>!!base&&(auto.checked!==base.autoCheck||style.checked!==base.includeStyle);
  function update(){
    controls.disabled=!state||busy;
    $<HTMLButtonElement>('save-writing').disabled=!state||busy||!dirty();
    $<HTMLButtonElement>('reset-writing').disabled=!state||busy;
    $('writing-unsaved').hidden=!dirty();$('site-overrides').inert=busy;$('add-override-form').inert=!state||busy;
  }
  function adopt(next:InlineSettings,reset=false){
    if(state&&next.defaults.revision<state.defaults.revision)return;
    const keep=dirty()&&!reset;
    if(!keep){auto.checked=next.defaults.autoCheck;style.checked=next.defaults.includeStyle;base={...next.defaults};}
    else if(base&&base.autoCheck===next.defaults.autoCheck&&base.includeStyle===next.defaults.includeStyle)base.revision=next.defaults.revision;
    state=next;renderSites();update();
  }
  async function message(data:object){const result=await chrome.runtime.sendMessage(data);if(result?.error)throw new Error(result.error);return result;}
  async function refresh(){
    const epoch=++refreshEpoch;
    try{const next=await message({type:'inlineSettings'});if(epoch===refreshEpoch)adopt(next);}
    catch(e){status((e as Error).message,true);}
  }
  async function mutate(action:{action:string;[key:string]:unknown},revision:number,reset=false){
    if(busy)return;const site=action.action!=='defaults';busy=true;update();
    try{const next=await message({type:'inlineSettingsAction',...action,revision});adopt(next,reset);status('检查设置已保存；下次进入编辑区或输入时生效。',false,site);}
    catch(e){status((e as Error).message,true,site);await refresh();}
    finally{busy=false;update();}
  }
  function renderSites(){
    const list=$('site-overrides');list.replaceChildren();
    if(!state)return;
    if(!state.sites.length){const empty=document.createElement('p');empty.className='help empty-sites';empty.textContent='暂无网站例外，所有已授权网页跟随全局默认。';list.append(empty);return;}
    for(const site of state.sites){
      const row=document.createElement('div');row.className='override-row';row.dataset.origin=site.origin;
      const name=document.createElement('strong');name.className='override-origin';name.textContent=site.origin;name.translate=false;row.append(name);
      const options=document.createElement('div');options.className='override-controls';
      for(const [key,label] of [['autoCheck','自动检查'],['includeStyle','表达优化']] as const){
        const wrap=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
        input.type='checkbox';input.checked=site[key];input.dataset.option=key;input.setAttribute('aria-label',label);text.textContent=label;
        input.addEventListener('change',()=>void mutate({action:'site',origin:site.origin,...{autoCheck:site.autoCheck,includeStyle:site.includeStyle},[key]:input.checked},state!.defaults.revision));
        wrap.append(input,text);options.append(wrap);
      }
      const reset=document.createElement('button');reset.type='button';reset.textContent='跟随全局设置';reset.addEventListener('click',()=>void mutate({action:'resetSite',origin:site.origin},state!.defaults.revision));
      options.append(reset);row.append(options);list.append(row);
    }
  }
  $('writing-form').addEventListener('submit',event=>{event.preventDefault();if(base&&dirty())void mutate({action:'defaults',autoCheck:auto.checked,includeStyle:style.checked},base.revision,true);});
  auto.addEventListener('change',update);style.addEventListener('change',update);
  $('reset-writing').addEventListener('click',()=>{if(state){adopt(state,true);status('');void refresh();}});
  $('add-override-form').addEventListener('submit',event=>{
    event.preventDefault();if(!state)return;
    try{const url=new URL($<HTMLInputElement>('override-origin').value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw 0;
      if(state.sites.some(site=>site.origin===url.origin)){status('此网站已有单独设置，请在下方修改。',true,true);return;}
      void mutate({action:'site',origin:url.origin,autoCheck:false,includeStyle:state.defaults.includeStyle},state.defaults.revision);
    }catch{status('请输入有效的普通网页地址。',true,true);}
  });
  chrome.runtime.onMessage.addListener(msg=>{if(msg.type==='inlineSettingsChanged')void refresh();});
  update();void refresh();void presets.refresh();
  return {hasUnsaved:()=>dirty()||presets.hasDraft()||dictionary.hasDraft()};
}
