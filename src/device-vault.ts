// Automatic device encryption: no password, no hard-coded key. This is not OS Keychain protection.
export type DeviceEnvelope = { version: 1; baseUrl?: string; algorithm: 'AES-GCM'; iv: string; ciphertext: string };
const aad = new TextEncoder().encode('Lingo/device-key/v1');
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function decode(value: unknown, maximum: number) {
  if (typeof value !== 'string' || value.length > maximum * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid device vault');
  const result = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (result.length > maximum) throw new Error('Invalid device vault');
  return result;
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lingo-device-vault', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法访问本机凭据存储。'));
    request.onblocked = () => reject(new Error('本机凭据存储正忙，请重试。'));
  });
}
async function keyOperation(mode: 'read' | 'write' | 'delete', key?: CryptoKey): Promise<CryptoKey | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', mode === 'read' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('keys');
      const request = mode === 'read' ? store.get('aes') : mode === 'write' ? store.put(key, 'aes') : store.delete('aes');
      tx.oncomplete = () => resolve(mode === 'read' ? request.result : undefined);
      tx.onabort = tx.onerror = () => reject(new Error('本机凭据存储失败，请重试。'));
    });
  } finally { db.close(); }
}
export async function encryptDeviceKey(secret: string, baseUrl?: string): Promise<DeviceEnvelope> {
  let key = await keyOperation('read');
  if (!key) {
    key = await crypto.subtle.generateKey({name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
    await keyOperation('write', key);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:baseUrl ? new TextEncoder().encode('Lingo/service/' + baseUrl) : aad}, key, new TextEncoder().encode(secret));
  return {version:1,...(baseUrl ? {baseUrl} : {}),algorithm:'AES-GCM',iv:encode(iv),ciphertext:encode(new Uint8Array(ciphertext))};
}
export async function decryptDeviceKey(input: unknown, expectedBaseUrl = 'https://api.openai.com/v1'): Promise<string> {
  try {
    const record = input as DeviceEnvelope;
    if ((record?.baseUrl || 'https://api.openai.com/v1') !== expectedBaseUrl) throw new Error('wrong service');
    if (!record || record.version !== 1 || record.algorithm !== 'AES-GCM') throw new Error('Invalid device vault');
    const iv = decode(record.iv,12), ciphertext = decode(record.ciphertext,1024);
    if (iv.length !== 12 || ciphertext.length < 16) throw new Error('Invalid device vault');
    const key = await keyOperation('read');
    if (!key) throw new Error('Missing device key');
    return new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:record.baseUrl ? new TextEncoder().encode('Lingo/service/' + record.baseUrl) : aad},key,ciphertext));
  } catch { throw new Error('本机凭据无法读取，请重新填写 API Key 并保存。'); }
}
export async function removeDeviceKey() { await keyOperation('delete'); }
