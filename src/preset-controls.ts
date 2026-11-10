import { emptyPresets, MAX_PRESETS, type PresetState, type RewritePreset, type PresetAction } from './presets';

export function createPresetPicker(container:HTMLElement, options:{choices:HTMLElement;run:(preset:RewritePreset)=>void;changed:(items:RewritePreset[])=>void}) {
  const choices=document.createElement('div');choices.className='saved-presets';options.choices.append(choices);
  const status=document.createElement('div');status.className='preset-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');container.append(status);
  let state=emptyPresets(),selectedId='';
  function select(id=''){selectedId=id;choices.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===id)));}
  async function refresh(){
    try{
      const next=await chrome.runtime.sendMessage({type:'presetState'});if(next.error)throw new Error(next.error);
      if(next.revision<state.revision)return;
      state=next;status.textContent='';status.classList.remove('error');options.changed(state.items);
      choices.replaceChildren(...state.items.map(p=>{
        const b=document.createElement('button');b.type='button';b.translate=false;b.textContent=p.name;b.title=p.instruction;b.dataset.preset=p.id;
        b.addEventListener('click',()=>options.run({...p}));return b;
      }));select(selectedId);
    }catch(e){status.textContent=(e as Error).message;status.classList.add('error');}
  }
  chrome.runtime.onMessage.addListener(msg=>{if(msg.type==='presetsChanged')void refresh();});
  return {refresh,select,reset:()=>{status.textContent='';}};
}

export function createPresetControls(container: HTMLElement, options: {
  run?: (preset: RewritePreset) => void;
  managementOnly?: boolean;
  changed: (items: RewritePreset[]) => void;
  instruction: () => string;
}) {
  container.innerHTML = `<div class="saved-heading"><span>我的预设</span><button type="button" class="manage-presets" aria-expanded="false">管理预设</button></div>
    <div class="saved-presets"></div><div class="preset-manager" hidden>
    <p class="preset-help">预设仅保存在本机；保存不会发送原文或调用 API。</p>
    <div class="preset-list"></div><button type="button" class="add-preset">新增预设</button>
    <form class="preset-form" hidden><label>预设名称<input class="preset-name" maxlength="32" required placeholder="例如：邮件更委婉"></label>
    <label>修改要求<textarea class="preset-instruction" rows="3" maxlength="1000" required placeholder="例如：保留原意，将语气改得更委婉，不增加承诺。"></textarea></label>
    <div class="preset-form-actions"><button type="submit" class="primary">保存预设</button><button type="button" class="cancel-preset">取消编辑</button></div></form></div>
    <div class="preset-status" role="status" aria-live="polite"></div>`;
  const $ = <T extends HTMLElement = HTMLElement>(selector:string) => container.querySelector<T>(selector)!;
  const choices=$('.saved-presets'), manage=$('.manage-presets');
  if(options.managementOnly){$('.saved-heading').hidden=true;$('.saved-presets').hidden=true;$('.preset-manager').hidden=false;}
  const manager = $('.preset-manager'), form = $<HTMLFormElement>('.preset-form');
  const name = $<HTMLInputElement>('.preset-name'), instruction = $<HTMLTextAreaElement>('.preset-instruction');
  let state: PresetState = emptyPresets(), editingId: string | undefined, draftRevision = 0, busy = false, deletingId = '';
  let draftInitial='';
  let resetEpoch = 0, selectedId = '', refreshError = false; 
  function status(text:string, error=false) { $('.preset-status').textContent=text; $('.preset-status').classList.toggle('error',error); }
  function button(text:string, action:()=>void) { const b=document.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',action);return b; }
  function adopt(next: PresetState) {
    if (next.revision < state.revision) return;
    state=next; options.changed(state.items); render();
  }
  async function refresh() {
    try { const r=await chrome.runtime.sendMessage({type:'presetState'}); if(r.error)throw new Error(r.error); if(refreshError){status('');refreshError=false;} adopt(r); }
    catch(e){refreshError=true;status((e as Error).message,true);}
  }
  function resetDraft() { form.hidden=true; editingId=undefined; name.value=instruction.value=''; deletingId=''; }
  function edit(preset?:RewritePreset) {
    editingId=preset?.id;draftRevision=state.revision;deletingId='';
    name.value=preset?.name||'';instruction.value=preset?.instruction||options.instruction();
    draftInitial=JSON.stringify([name.value,instruction.value]);form.hidden=false;status('');render();name.focus();
  }
  async function mutate(action: Omit<PresetAction,'revision'>, revision=state.revision) {
    if (busy) return;
    busy=true;manager.inert=true; const epoch=resetEpoch;
    try {
      const next=await chrome.runtime.sendMessage({type:'presetAction',...action,revision});
      if(next.error)throw new Error(next.error);
      if(epoch===resetEpoch) { resetDraft();status(action.action==='delete'?'预设已删除。':action.action==='move'?'顺序已保存。':'预设已保存。'); }
      adopt(next);
    } catch(e) { if(epoch===resetEpoch)status((e as Error).message,true); await refresh(); }
    finally {busy=false;manager.inert=false;}
  }
  function render() {
    const buttons = state.items.map(p => {
      const b=button(p.name,()=>options.run?.({...p}));b.translate=false;b.title=p.instruction;b.dataset.preset=p.id;b.setAttribute('aria-pressed',String(selectedId===p.id));return b;
    });
    choices.replaceChildren(...buttons);
    const list=$('.preset-list');list.replaceChildren();
    for(const [i,p] of state.items.entries()) {
      const row=document.createElement('div');row.className='preset-row';row.dataset.presetId=p.id;
      const title=document.createElement('span');title.className='preset-row-name';title.translate=false;title.textContent=p.name;title.title=p.instruction;row.append(title);
      const actions=document.createElement('div');actions.className='preset-row-actions';
      if (deletingId===p.id) {
        actions.append(button('确认删除',()=>void mutate({action:'delete',id:p.id})),button('取消',()=>{deletingId='';render();}));
      } else {
        const up=button('↑',()=>void mutate({action:'move',id:p.id,direction:-1}));up.setAttribute('aria-label','上移预设');up.title='上移预设';up.disabled=i===0;
        const down=button('↓',()=>void mutate({action:'move',id:p.id,direction:1}));down.setAttribute('aria-label','下移预设');down.title='下移预设';down.disabled=i===state.items.length-1;
        actions.append(up,down,button('编辑',()=>edit(p)),button('删除预设',()=>{deletingId=p.id;render();}));
      }
      row.append(actions);list.append(row);
    }
    $<HTMLButtonElement>('.add-preset').disabled=state.items.length>=MAX_PRESETS;
    if (!state.items.length) { const empty=document.createElement('p');empty.className='preset-help';empty.textContent='还没有自定义预设，点击新增即可创建。';list.append(empty); }
  }
  manage.addEventListener('click',()=>{
    if(busy)return;
    manager.hidden=!manager.hidden;manage.setAttribute('aria-expanded',String(!manager.hidden));
    if(!manager.hidden)void refresh();
  });
  $('.add-preset').addEventListener('click',()=>edit());
  $('.cancel-preset').addEventListener('click',()=>{resetDraft();status('');render();});
  form.addEventListener('submit',e=>{e.preventDefault();void mutate({action:'save',...(editingId?{id:editingId}:{}),name:name.value,instruction:instruction.value},draftRevision);});
  render();
  chrome.runtime.onMessage.addListener(msg=>{if(msg.type==='presetsChanged')void refresh();});
  return {refresh, hasDraft:()=>!form.hidden&&JSON.stringify([name.value,instruction.value])!==draftInitial, reset:()=>{resetEpoch++;resetDraft();manager.hidden=!options.managementOnly;manage.setAttribute('aria-expanded','false');status('');render();}, select:(id='')=>{selectedId=id;
    choices.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===id)));
  }};
}
