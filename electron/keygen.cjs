// electron/keygen.cjs
// DEV-ONLY tool. Never bundled (excluded in package.json build.files).
// Run with no args to mint the Ed25519 keypair and print the public key to
// paste into licensing.cjs's PUBLIC_KEY_PEM. Run with an email to mint a
// license key for that buyer using the already-generated private key.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PRIVATE_KEY_PATH = path.join(__dirname, 'private-key.pem');

function ensureKeypair() {
  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    return fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  fs.writeFileSync(PRIVATE_KEY_PATH, privatePem, { mode: 0o600 });
  console.log('Generated a new Ed25519 keypair.');
  console.log(`Private key saved to: ${PRIVATE_KEY_PATH} (keep this safe, never commit it)`);
  console.log('\nPaste this into electron/licensing.cjs as PUBLIC_KEY_PEM:\n');
  console.log(publicPem);
  return privatePem;
}

function mintLicense(email) {
  const privatePem = ensureKeypair();
  const privateKey = crypto.createPrivateKey(privatePem);
  const payload = { email, issued: Date.now(), tier: 'pro' };
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = crypto.sign(null, payloadBuf, privateKey);
  const key = `${payloadBuf.toString('base64url')}.${sig.toString('base64url')}`;
  console.log(`\nLicense key for ${email}:\n`);
  console.log(key);
  return key;
}

const email = process.argv[2];
if (!email) {
  ensureKeypair();
  console.log('\nNo email given — keypair ensured only. To mint a license key:');
  console.log('  node electron/keygen.cjs "buyer@example.com"');
} else {
  mintLicense(email);
}
