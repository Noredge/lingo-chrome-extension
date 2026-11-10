import {createPanel} from './panel';
const panel=createPanel({container:document.getElementById('panel')!,onClose:()=>window.close()});
let windowId=0,sourceTabId=-1,lastSelection='',inboxQueue=Promise.resolve();
async function receive(){
  const item=await chrome.runtime.sendMessage({type:'panelSelection',windowId});
  if(!item?.id || item.id===lastSelection)return;
  lastSelection=item.id;sourceTabId=item.tabId;await panel.showText(item.text,item.mode==='proofread'?'proofread':item.mode==='translate'?'translate':undefined);
}
function receiveNext(){inboxQueue=inboxQueue.catch(()=>{}).then(receive);}
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='session'&&changes['panel:'+windowId]?.newValue)receiveNext();
  if(area==='local'&&(changes.settings||changes.activeServiceId||changes.serviceProfiles))void panel.refresh();
});
chrome.tabs.onUpdated.addListener((id,c)=>{if(id===sourceTabId&&c.status==='loading')panel.clear();});
chrome.tabs.onRemoved.addListener(id=>{if(id===sourceTabId)panel.clear();});
chrome.tabs.onActivated.addListener(info=>{if(info.windowId===windowId)panel.clear();});
void chrome.windows.getCurrent().then(w=>{windowId=w.id!;receiveNext();});
window.addEventListener('pagehide',()=>panel.clear());
