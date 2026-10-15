/**
 * Standard RFC 6238 TOTP (Google Authenticator) implementation
 * Zero external dependencies - uses standard Web Crypto API (crypto.subtle)
 */

// Base32 Alphabet
const RFC4648_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32ToBytes(base32) {
  const clean = base32.toUpperCase().replace(/[\s-]/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (let i = 0; i < clean.length; i++) {
    const val = RFC4648_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

export function generateRandomBase32(length = 16) {
  let result = '';
  const cryptoObj = window.crypto || window.msCrypto;
  const randomBytes = new Uint8Array(length);
  cryptoObj.getRandomValues(randomBytes);
  for (let i = 0; i < length; i++) {
    result += RFC4648_ALPHABET[randomBytes[i] % RFC4648_ALPHABET.length];
  }
  return result;
}

export async function generateTOTPCode(secretBase32, timeOffsetSteps = 0) {
  try {
    const secretBytes = base32ToBytes(secretBase32);
    if (!secretBytes || secretBytes.length === 0) return null;

    const epoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(epoch / 30) + timeOffsetSteps;

    const counterBuffer = new ArrayBuffer(8);
    const counterView = new DataView(counterBuffer);
    counterView.setUint32(0, Math.floor(counter / 0x100000000), false);
    counterView.setUint32(4, counter % 0x100000000, false);

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: { name: 'SHA-1' } },
      false,
      ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
    const sigBytes = new Uint8Array(signature);
    const offset = sigBytes[sigBytes.length - 1] & 0x0f;
    const binary =
      ((sigBytes[offset] & 0x7f) << 24) |
      ((sigBytes[offset + 1] & 0xff) << 16) |
      ((sigBytes[offset + 2] & 0xff) << 8) |
      (sigBytes[offset + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, '0');
    return otp;
  } catch (err) {
    console.error('TOTP generation error:', err);
    return null;
  }
}

/**
 * Verify a 6-digit code against a base32 secret with +/- 1 time-step tolerance (90s window)
 */
export async function verifyTOTPCode(inputCode, secretBase32, backupPin = null) {
  if (!inputCode) return false;
  const cleanCode = inputCode.toString().trim().replace(/[\s-]/g, '');

  // 1. Check backup PIN if configured
  if (backupPin && cleanCode === backupPin.toString().trim()) {
    return true;
  }

  // 2. Must be 6 digits for TOTP
  if (!cleanCode || cleanCode.length !== 6) {
    return false;
  }

  // 3. Check TOTP window (-1, 0, +1 steps)
  for (let offset = -1; offset <= 1; offset++) {
    const validCode = await generateTOTPCode(secretBase32, offset);
    if (validCode && validCode === cleanCode) {
      return true;
    }
  }

  return false;
}

/**
 * Generate standard Google Authenticator QR URL
 */
export function getGoogleAuthQrUrl(username, secretBase32) {
  const label = encodeURIComponent(`Gradely Admin (${username || 'SuperAdmin'})`);
  const issuer = encodeURIComponent('Gradely');
  const otpauth = `otpauth://totp/${label}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(otpauth)}`;
}
