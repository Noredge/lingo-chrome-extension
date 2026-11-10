import test from 'node:test';
import assert from 'node:assert/strict';
import {readInlineDefaults,readInlineOptions,resolveInlineOptions,inlineOrigin} from '../src/inline-preferences.ts';

test('new and upgraded installations keep automatic checking off without changing site overrides',()=>{
  const defaults=readInlineDefaults(undefined);
  assert.deepEqual(defaults,{version:1,revision:0,autoCheck:false,includeStyle:false});
  const legacy={autoCheck:true,includeStyle:true};
  assert.deepEqual(resolveInlineOptions(defaults,legacy),{...legacy,inherited:false});
  assert.deepEqual(resolveInlineOptions(defaults,undefined),{autoCheck:false,includeStyle:false,inherited:true});
});
test('explicit website options override both global defaults, including explicit off',()=>{
  const defaults={version:1 as const,revision:7,autoCheck:true,includeStyle:true};
  assert.deepEqual(resolveInlineOptions(defaults,{autoCheck:false,includeStyle:false}),{autoCheck:false,includeStyle:false,inherited:false});
  assert.deepEqual(resolveInlineOptions(defaults,undefined),{autoCheck:true,includeStyle:true,inherited:true});
  assert.deepEqual(readInlineDefaults({...defaults,unrelated:'ignored'}),defaults);
});
test('malformed settings fail closed instead of converting strings or partially enabling checks',()=>{
  for(const value of [null,{},[],{autoCheck:'false',includeStyle:true},{autoCheck:true},{autoCheck:1,includeStyle:0}])assert.throws(()=>readInlineOptions(value));
  for(const value of [null,{}, {version:2,revision:0,autoCheck:true,includeStyle:false}, {version:1,revision:-1,autoCheck:false,includeStyle:false}, {version:1,revision:NaN,autoCheck:false,includeStyle:false}])assert.throws(()=>readInlineDefaults(value));
});
test('website preference keys use exact HTTP origins and reject ambiguous addresses',()=>{
  for(const origin of ['https://example.com','http://localhost:8765','http://[::1]:8765'])assert.equal(inlineOrigin(origin),origin);
  for(const value of [null,'https://example.com/','https://example.com/path','https://example.com:443','HTTPS://EXAMPLE.COM','https://user:secret@example.com','file:///tmp/test','javascript:alert(1)','null','example.com'])assert.throws(()=>inlineOrigin(value));
});
