// Password-derived encryption. Neither the password nor a reusable decryption key is persisted.
export type EncryptedKey = { version: 1; algorithm: 'AES-GCM'; kdf: 'PBKDF2-SHA256'; iterations: 600000; salt: string; iv: string; ciphertext: string };
const ITERATIONS = 600000;
const aad = new TextEncoder().encode('Lingo/OpenAI-key/v1');
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function decode(value: unknown, max: number) {
  if (typeof value !== 'string' || value.length > max * 2 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('invalid vault');
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>, usage: KeyUsage[]) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, usage);
}
export async function encryptKey(apiKey: string, password: string): Promise<EncryptedKey> {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Error('本机解锁密码需要 12–1,024 个字符。');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, new TextEncoder().encode(apiKey));
  return { version: 1, algorithm: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
}
export async function decryptKey(input: unknown, password: string): Promise<string> {
  try {
    const vault = input as EncryptedKey;
    if (typeof password !== 'string' || !password.length || password.length > 1024 || !vault || vault.version !== 1 || vault.algorithm !== 'AES-GCM' || vault.kdf !== 'PBKDF2-SHA256' || vault.iterations !== ITERATIONS) throw new Error('invalid vault');
    const salt = decode(vault.salt,16), iv = decode(vault.iv,12), ciphertext = decode(vault.ciphertext,1024);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 16 || ciphertext.length > 1024) throw new Error('invalid vault');
    const key = await derive(password, salt, ['decrypt']);
    return new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({ name:'AES-GCM', iv, additionalData: aad }, key, ciphertext));
  } catch { throw new Error('解锁失败：密码不正确，或加密数据已损坏。'); }
}
