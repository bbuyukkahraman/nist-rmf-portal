// Minimal TOTP (RFC 6238) implementation for Cloudflare Workers.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  // pad
  while (output.length % 8 !== 0) output += '=';
  return output;
}

export function base32Decode(str: string): Uint8Array {
  const s = str.replace(/=+$/, '').toUpperCase().replace(/\s/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(s[i]);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hmacSha1(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msg);
  return new Uint8Array(sig);
}

function counterBytes(counter: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // big-endian 64-bit
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);
  return new Uint8Array(buf);
}

export async function totpCode(secretBase32: string, timestampMs: number = Date.now(), period = 30, digits = 6): Promise<string> {
  const counter = Math.floor(timestampMs / 1000 / period);
  const key = base32Decode(secretBase32);
  const mac = await hmacSha1(key, counterBytes(counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24) | ((mac[offset + 1] & 0xff) << 16) | ((mac[offset + 2] & 0xff) << 8) | (mac[offset + 3] & 0xff);
  const otp = code % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

export async function verifyTotp(secretBase32: string, code: string, window = 1): Promise<boolean> {
  const now = Date.now();
  for (let w = -window; w <= window; w++) {
    const ts = now + w * 30 * 1000;
    const expected = await totpCode(secretBase32, ts);
    if (expected === code.replace(/\s/g, '')) return true;
  }
  return false;
}

export function generateSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function otpauthUri(secret: string, account: string, issuer = 'NIST RMF Portal'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}
