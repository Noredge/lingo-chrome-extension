import {readDictionary,wordKey,type DictionaryState} from './dictionary';

export function createDictionaryControls(){
  const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
  const input=$<HTMLInputElement>('dictionary-word'),search=$<HTMLInputElement>('dictionary-search');
  let state:DictionaryState|null=null,busy=false,failed=false,epoch=0;
  function status(text:string,error=false){$('dictionary-status').textContent=text;$('dictionary-status').classList.toggle('error',error);}
  function render(){
    $('dictionary-form').inert=busy||failed||!state;$('dictionary-list').inert=busy||failed;
    $<HTMLButtonElement>('dictionary-refresh').disabled=busy;
    $('dictionary-count').textContent=state?`${state.words.length} / 500`:'';
    const list=$('dictionary-list');list.replaceChildren();if(!state)return;
    const query=wordKey(search.value.trim()),words=state.words.filter(word=>wordKey(word).includes(query)).sort((a,b)=>a.localeCompare(b));
    if(!words.length){const p=document.createElement('p');p.className='help';p.textContent=query?'没有匹配的词条。':'还没有词条，可手动添加，或在拼写建议卡中加入。';list.append(p);return;}
    for(const word of words){const row=document.createElement('div');row.className='dictionary-row';row.setAttribute('role','listitem');
      const label=document.createElement('span');label.translate=false;label.textContent=word;
      const remove=document.createElement('button');remove.type='button';remove.textContent='移除词条';remove.setAttribute('aria-label',`移除词条：${word}`);
      const revision=state.revision;remove.addEventListener('click',()=>void mutate('delete',word,revision));row.append(label,remove);list.append(row);
    }
  }
  function adopt(value:unknown){const next=readDictionary(value);if(state&&next.revision<state.revision)return;state=next;failed=false;render();}
  async function refresh(){const request=++epoch;try{const next=await chrome.runtime.sendMessage({type:'dictionaryState'});if(request!==epoch)return;if(next?.error)throw new Error(next.error);adopt(next);}
    catch(e){if(request===epoch){failed=true;status((e as Error).message,true);render();}}
  }
  async function mutate(action:'add'|'delete',word:string,revision:number){
    if(busy||failed||!state)return;busy=true;render();
    try{const next=await chrome.runtime.sendMessage({type:'dictionaryAction',action,word,revision});if(next?.error)throw new Error(next.error);adopt(next);
      if(action==='add'&&input.value===word)input.value='';
      status(action==='add'?'已加入个人词典；原文未修改。':'词条已移除，下次检查会恢复检查这个词。');
    }catch(e){status((e as Error).message,true);await refresh();}
    finally{busy=false;render();}
  }
  $('dictionary-form').addEventListener('submit',event=>{event.preventDefault();if(state)void mutate('add',input.value,state.revision);});
  search.addEventListener('input',render);
  $('dictionary-refresh').addEventListener('click',()=>{status('');void refresh();});
  chrome.runtime.onMessage.addListener(message=>{if(message.type==='dictionaryChanged')void refresh();});
  render();void refresh();
  return {hasDraft:()=>!!input.value.trim()};
}
