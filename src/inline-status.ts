export type CheckServiceStatus={ready:boolean;label:string;message:string;action:string};
export function checkServiceStatus(config:{hasKey?:boolean;hasVault?:boolean;deviceError?:boolean;dataConsent?:boolean}):CheckServiceStatus {
  if(config.deviceError)return {ready:false,label:'Lingo · 需设置',message:'本机凭据无法读取，请重新填写 API Key 并保存。',action:'配置检查服务'};
  if(!config.hasKey&&config.hasVault)return {ready:false,label:'Lingo · 已锁定',message:'Key 已锁定，请在设置中输入本机解锁密码。',action:'解锁 Key'};
  if(!config.hasKey)return {ready:false,label:'Lingo · 需设置',message:'请先打开设置，填写你的 API Key。',action:'配置检查服务'};
  if(!config.dataConsent)return {ready:false,label:'Lingo · 需确认',message:'请先在设置中确认将选中文字发送给所选服务的说明并保存。',action:'确认数据说明'};
  return {ready:true,label:'',message:'',action:'打开设置'};
}
