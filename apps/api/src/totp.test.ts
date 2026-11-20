import { describe, it, expect } from 'vitest';
import { generateSecret, totpCode, verifyTotp, base32Encode, base32Decode } from './totp';

describe('totp', () => {
  it('base32 roundtrip', () => {
    const bytes = new Uint8Array([1,2,3,4,5]);
    const enc = base32Encode(bytes);
    const dec = base32Decode(enc);
    expect(Array.from(dec)).toEqual(Array.from(bytes));
  });
  it('generates 6-digit code', async () => {
    const secret = generateSecret();
    const code = await totpCode(secret);
    expect(code).toMatch(/^\d{6}$/);
  });
  it('verifies current code', async () => {
    const secret = generateSecret();
    const code = await totpCode(secret);
    expect(await verifyTotp(secret, code)).toBe(true);
  });
  it('rejects wrong code', async () => {
    const secret = generateSecret();
    expect(await verifyTotp(secret, '000000')).toBe(false);
  });
});
