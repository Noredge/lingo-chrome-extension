import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyPresets, readPresets, updatePresets, MAX_PRESETS} from '../src/presets.ts';

test('presets migrate absent storage without seeding instructions; CRUD preserves stable ids and explicit order',()=>{
  let state=readPresets(undefined);assert.deepEqual(state,emptyPresets());
  state=updatePresets(state,{action:'save',revision:0,name:'  邮件委婉  ',instruction:'  保留原意。  '},'one');
  assert.deepEqual(state.items,[{id:'one',name:'邮件委婉',instruction:'保留原意。'}]);
  state=updatePresets(state,{action:'save',revision:1,name:'第二个',instruction:'Only grammar.'},'two');
  state=updatePresets(state,{action:'move',revision:2,id:'two',direction:-1},'unused');
  assert.deepEqual(state.items.map(x=>x.id),['two','one']);
  state=updatePresets(state,{action:'save',revision:3,id:'one',name:'New name',instruction:'New instruction.'},'unused');
  assert.equal(state.items[1].id,'one');assert.equal(state.items[1].instruction,'New instruction.');
  state=updatePresets(state,{action:'delete',revision:4,id:'two'},'unused');
  assert.equal(state.items.length,1);assert.equal(state.revision,5);assert.deepEqual(readPresets(state),state);
});
test('invalid preset edits, stale revisions and duplicate names leave prior state intact',()=>{
  const state=updatePresets(emptyPresets(),{action:'save',revision:0,name:'Example',instruction:'Preserve meaning.'},'one');
  const before=JSON.stringify(state);
  for(const action of [
    {action:'save',revision:0,name:'stale',instruction:'old'},
    {action:'save',revision:1,name:'example',instruction:'Duplicate'},
    {action:'save',revision:1,name:' ',instruction:'x'},
    {action:'save',revision:1,name:'x'.repeat(33),instruction:'x'},
    {action:'save',revision:1,name:'x',instruction:' '},
    {action:'save',revision:1,name:'x',instruction:'x'.repeat(1001)},
    {action:'save',revision:1,id:'missing',name:'x',instruction:'x'},
    {action:'delete',revision:1},
    {action:'move',revision:1,id:'one',direction:1},
    {action:'move',revision:1,id:'one',direction:0},
  ]) assert.throws(()=>updatePresets(state,action as any,'new'));
  assert.equal(JSON.stringify(state),before);
});
test('preset count and fields are bounded, while user markup and multilingual names remain literal',()=>{
  let state=emptyPresets();
  for(let i=0;i<MAX_PRESETS;i++)state=updatePresets(state,{action:'save',revision:i,name:`<b>预设 ${i}</b>`,instruction:'X'.repeat(1000)},`id-${i}`);
  assert.throws(()=>updatePresets(state,{action:'save',revision:20,name:'overflow',instruction:'x'},'extra'));
  assert.equal(state.items[0].name,'<b>预设 0</b>');
  assert.deepEqual(readPresets(state),state);
});
test('malformed or unknown stored preset schemas fail without destructive migration',()=>{
  for(const bad of [null,{},[],{version:2,revision:0,items:[]},{version:1,revision:-1,items:[]},{version:1,revision:0,items:[{id:'x',name:'',instruction:'x'}]},
    {version:1,revision:0,items:[{id:'x',name:'A',instruction:'x'},{id:'x',name:'B',instruction:'y'}]}])assert.throws(()=>readPresets(bad));
});
