// electron/licensing.cjs
// Pure Ed25519 license-key verification for Matrix Pro. No I/O, never throws.
const crypto = require('crypto');

const STORE_KEY = 'iptv.license.v1';

// Placeholder — replace with the real public key printed by `keygen.cjs`
// before shipping. Until replaced, every real license key will fail
// verification (safe default: nothing activates by accident).
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAlNkyC20JS6VDBapVvwISPhgBawsE0fragBfjQN1HF7o=
-----END PUBLIC KEY-----
`;

function verifyLicense(key) {
  try {
    if (typeof key !== 'string' || key.length === 0) return null;
    const parts = key.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return null;

    const payloadBuf = Buffer.from(payloadB64, 'base64url');
    const sigBuf = Buffer.from(sigB64, 'base64url');

    const publicKey = crypto.createPublicKey({ key: PUBLIC_KEY_PEM, format: 'pem' });
    const valid = crypto.verify(null, payloadBuf, publicKey, sigBuf);
    if (!valid) return null;

    const payload = JSON.parse(payloadBuf.toString('utf8'));
    if (!payload || typeof payload.email !== 'string' || typeof payload.issued !== 'number' || payload.tier !== 'pro') {
      return null;
    }
    return { email: payload.email, issued: payload.issued, tier: payload.tier };
  } catch (e) {
    return null;
  }
}

module.exports = { verifyLicense, STORE_KEY, PUBLIC_KEY_PEM };
