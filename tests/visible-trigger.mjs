// These suites exercise the explicit button workflow. Quiet/default behavior is
// covered separately in trigger-visibility.mjs; do not depend on the old default.
export async function useVisibleTrigger(worker){
  await worker.evaluate(async()=>{
    const {inlineCheckDefaults:old}=await chrome.storage.local.get('inlineCheckDefaults');
    await chrome.storage.local.set({inlineCheckDefaults:{version:1,revision:0,autoCheck:false,includeStyle:false,...old,triggerVisibility:'always'}});
  });
}
