import type {InlineDefaults,InlineSettings} from './inline-preferences';

// Fixed local examples: this guide never connects a task port or submits text.
export function createWritingGuide(changed:()=>void){
  const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const manual=$<HTMLInputElement>('guide-manual'),auto=$<HTMLInputElement>('guide-auto'),style=$<HTMLInputElement>('guide-style');
  const controls=$<HTMLFieldSetElement>('guide-check-controls');
  let baseline:InlineDefaults|null=null,epoch=0;
  async function message(data:object){const result=await chrome.runtime.sendMessage(data);if(result?.error)throw new Error(result.error);return result;}
  function adopt(state:InlineSettings){
    baseline={...state.defaults};manual.checked=!baseline.autoCheck;auto.checked=baseline.autoCheck;style.checked=baseline.includeStyle;
    $('guide-site-note').textContent=state.sites.length?'已有网站单独设置会继续保留，不受这里的全局选择影响。':'全局选择适用于已授权、未暂停且没有单独设置的网页。';
    controls.disabled=false;changed();
  }
  async function refresh(){
    const request=++epoch;controls.disabled=true;baseline=null;changed();
    try{const state=await message({type:'inlineSettings'});if(request===epoch){adopt(state);$('guide-load-status').textContent='';$('guide-load-status').classList.remove('error');}}
    catch(e){if(request===epoch){$('guide-load-status').textContent=(e as Error).message;$('guide-load-status').classList.add('error');}}
  }
  const dirty=()=>!!baseline&&(auto.checked!==baseline.autoCheck||style.checked!==baseline.includeStyle);
  async function save(){
    if(!baseline)throw new Error('检查设置尚未读取，请重试或跳过这一步。');
    if(!dirty())return;
    try{adopt(await message({type:'inlineSettingsAction',action:'defaults',autoCheck:auto.checked,includeStyle:style.checked,revision:baseline.revision}));}
    catch(e){await refresh();throw e;}
  }
  for(const input of [manual,auto,style])input.addEventListener('change',changed);
  $('guide-retry').addEventListener('click',()=>void refresh());

  const examples=[{source:'has',replacement:'have',kind:'grammar',reason:'主语 I 应搭配 have。'},{source:'in order to',replacement:'to',kind:'style',reason:'用更简洁的表达，保留原意。'}];
  const accepted=new Set<number>(),history:number[]=[];
  const sentence=$('guide-sentence'),card=$('guide-suggestion');
  let selected:number|null=null,closeTimer:ReturnType<typeof setTimeout>|undefined;
  const cancelClose=()=>clearTimeout(closeTimer);
  function hide(){cancelClose();card.hidden=true;selected=null;sentence.querySelectorAll('[aria-expanded]').forEach(el=>el.setAttribute('aria-expanded','false'));}
  function show(index:number,focus=false){
    cancelClose();selected=index;const example=examples[index];
    sentence.querySelectorAll('[aria-expanded]').forEach(el=>el.setAttribute('aria-expanded',String(el.getAttribute('data-example')===String(index))));
    $('guide-reason').textContent=example.reason;$('guide-replacement').textContent=example.replacement;
    card.dataset.kind=example.kind;card.hidden=false;
    const word=sentence.querySelector<HTMLElement>(`[data-example="${index}"]`)!,area=$('guide-demo-surface').getBoundingClientRect(),rect=word.getBoundingClientRect();
    card.style.left=Math.max(0,Math.min(rect.left-area.left,area.width-card.offsetWidth))+'px';
    card.style.top=(rect.bottom-area.top+10)+'px';
    if(focus)$('guide-accept').focus();
  }
  function render(){
    hide();sentence.replaceChildren();
    const word=(index:number)=>{
      if(accepted.has(index))return document.createTextNode(examples[index].replacement);
      const button=document.createElement('button');button.type='button';button.className='guide-word '+examples[index].kind;button.dataset.example=String(index);button.textContent=examples[index].source;button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','guide-suggestion');
      button.addEventListener('pointerenter',()=>show(index));button.addEventListener('focus',()=>show(index));
      button.addEventListener('click',()=>show(index,true));
      button.addEventListener('pointerleave',()=>{closeTimer=setTimeout(()=>{if(!card.contains(document.activeElement))hide();},220);});
      return button;
    };
    sentence.append('I ',word(0),' a plan. I am writing ',word(1),' share it.');
    $<HTMLButtonElement>('guide-undo').disabled=!history.length;
  }
  card.addEventListener('pointerenter',cancelClose);
  card.addEventListener('pointerleave',()=>{if(!card.contains(document.activeElement))hide();});
  $('guide-demo-surface').addEventListener('focusout',()=>queueMicrotask(()=>{if(!$('guide-demo-surface').contains(document.activeElement))hide();}));
  $('guide-demo-surface').addEventListener('keydown',event=>{if(event.key==='Escape'&&!card.hidden){event.preventDefault();event.stopPropagation();const index=selected;sentence.querySelector<HTMLElement>(`[data-example="${index}"]`)?.focus();hide();}});
  $('guide-accept').addEventListener('click',()=>{
    if(selected===null)return;accepted.add(selected);history.push(selected);render();
    $('guide-demo-status').textContent=accepted.size===examples.length?'两处建议都已接受。可以撤销或恢复示例，再试一次。':'已接受修改，对应下划线已消失。';$('guide-undo').focus();
  });
  $('guide-undo').addEventListener('click',()=>{const index=history.pop();if(index===undefined)return;accepted.delete(index);render();$('guide-demo-status').textContent='已撤销，原词和下划线已恢复。';});
  function reset(){accepted.clear();history.length=0;render();$('guide-demo-status').textContent='';}
  $('guide-reset').addEventListener('click',reset);
  window.addEventListener('resize',hide);
  reset();
  return {refresh,save,dirty,hide,ready:()=>!!baseline};
}
