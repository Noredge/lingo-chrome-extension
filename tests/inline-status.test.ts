import test from 'node:test';
import assert from 'node:assert/strict';
import {checkServiceStatus} from '../src/inline-status';
test('checking is ready only when consent and an accessible key are both present',()=>{
  assert.equal(checkServiceStatus({hasKey:true,dataConsent:true}).ready,true);
  for(const config of [{},{hasKey:true},{dataConsent:true}])assert.equal(checkServiceStatus(config).ready,false);
});
test('locked, missing, corrupted and unconsented credentials have distinct actionable states',()=>{
  assert.equal(checkServiceStatus({hasVault:true,dataConsent:true}).action,'解锁 Key');
  assert.match(checkServiceStatus({dataConsent:true}).message,/填写你的 API Key/);
  assert.match(checkServiceStatus({deviceError:true,hasKey:true,dataConsent:true}).message,/无法读取/);
  assert.equal(checkServiceStatus({hasKey:true,dataConsent:false}).action,'确认数据说明');
});
