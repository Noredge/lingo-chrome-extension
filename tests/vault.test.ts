import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptKey, decryptKey } from '../src/vault.ts';
const secret = 'sk-test-fixture-not-a-real-secret', password = 'fixture-only password 2026';
test('vault uses randomized authenticated encryption and does not serialize secret or password', async () => {
  const a = await encryptKey(secret,password), b = await encryptKey(secret,password);
  assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);assert.notEqual(a.ciphertext,b.ciphertext);
  assert(!JSON.stringify(a).includes(secret));assert(!JSON.stringify(a).includes(password));
  assert.equal(await decryptKey(a,password),secret);
});
test('wrong password, tampering and untrusted KDF parameters fail closed', async () => {
  const a = await encryptKey(secret,password);
  for (const [v,p] of [[a,'wrong password'],[{...a,ciphertext:(a.ciphertext[0]==='A'?'B':'A')+a.ciphertext.slice(1)},password],[{...a,iterations:1},password],[{...a,iv:'AAAA'},password],[null,password]] as const) {
    await assert.rejects(decryptKey(v,p),/解锁失败/);
  }
  await assert.rejects(encryptKey(secret,'short'),/12/);
});
