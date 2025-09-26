const apiKeyEl = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const importBtn = document.getElementById('importBtn');
const syncEnabledEl = document.getElementById('syncEnabled');
const encryptEnabledEl = document.getElementById('encryptEnabled');
const passphraseEl = document.getElementById('passphrase');
const encryptRowEl = document.getElementById('encryptRow');
const passRowEl = document.getElementById('passRow');

function setUiVisibility() {
  const syncOn = !!syncEnabledEl.checked;
  const encOn = !!encryptEnabledEl.checked;
  encryptRowEl.style.display = syncOn ? '' : 'none';
  passRowEl.style.display = syncOn && encOn ? '' : 'none';
}

function toBase64(bytes) {
  const bin = String.fromCharCode.apply(null, Array.from(new Uint8Array(bytes)));
  return btoa(bin);
}

function fromBase64(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveAesGcmKey(passphrase, salt, iterations) {
  const enc = new TextEncoder();
  const passBytes = enc.encode(passphrase);
  const baseKey = await crypto.subtle.importKey('raw', passBytes, { name: 'PBKDF2' }, false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return key;
}

async function encryptStringAesGcm(plaintext, passphrase) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 100000;
  const key = await deriveAesGcmKey(passphrase, salt, iterations);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return {
    ver: 1,
    alg: 'AES-GCM',
    kdf: 'PBKDF2',
    iter: iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    enc: toBase64(ct),
  };
}

async function decryptStringAesGcm(payload, passphrase) {
  const dec = new TextDecoder();
  const salt = new Uint8Array(fromBase64(payload.salt));
  const iv = new Uint8Array(fromBase64(payload.iv));
  const ct = fromBase64(payload.enc);
  const iterations = payload.iter || payload.iterations || 100000;
  const key = await deriveAesGcmKey(passphrase, salt, iterations);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return dec.decode(pt);
}

async function load() {
  const { openai_api_key, sync_enabled, encrypt_enabled } = await chrome.storage.local.get({ openai_api_key: '', sync_enabled: false, encrypt_enabled: false });
  apiKeyEl.value = openai_api_key || '';
  syncEnabledEl.checked = !!sync_enabled;
  encryptEnabledEl.checked = !!encrypt_enabled;
  setUiVisibility();
}

async function save() {
  const key = apiKeyEl.value.trim();
  const syncOn = !!syncEnabledEl.checked;
  const encOn = !!encryptEnabledEl.checked;
  const passphrase = passphraseEl.value;
  await chrome.storage.local.set({ openai_api_key: key, sync_enabled: syncOn, encrypt_enabled: encOn });

  if (syncOn) {
    if (encOn) {
      if (!passphrase) {
        alert('Enter a passphrase to encrypt the synced key.');
        return;
      }
      try {
        const payload = await encryptStringAesGcm(key, passphrase);
        await chrome.storage.sync.set({ openai_api_key_sync: payload });
      } catch (e) {
        alert('Encryption failed.');
        return;
      }
    } else {
      await chrome.storage.sync.set({ openai_api_key_sync: key });
    }
  }

  alert('Saved');
}

async function clearKey() {
  await chrome.storage.local.remove(['openai_api_key']);
  apiKeyEl.value = '';
  alert('Cleared');
}

async function importFromSync() {
  const synced = await chrome.storage.sync.get({ openai_api_key_sync: null });
  const value = synced.openai_api_key_sync;
  if (!value) {
    alert('Nothing found in Sync.');
    return;
  }
  if (typeof value === 'string') {
    apiKeyEl.value = value;
    await chrome.storage.local.set({ openai_api_key: value });
    alert('Imported from Sync.');
    return;
  }
  if (typeof value === 'object' && value && value.enc) {
    const passphrase = passphraseEl.value;
    if (!passphrase) {
      alert('Enter your passphrase to decrypt the synced key.');
      return;
    }
    try {
      const plaintext = await decryptStringAesGcm(value, passphrase);
      apiKeyEl.value = plaintext;
      await chrome.storage.local.set({ openai_api_key: plaintext });
      alert('Imported and decrypted from Sync.');
      return;
    } catch (e) {
      alert('Decryption failed. Check your passphrase.');
      return;
    }
  }
  alert('Unexpected Sync format.');
}

saveBtn.addEventListener('click', save);
clearBtn.addEventListener('click', clearKey);
importBtn.addEventListener('click', importFromSync);
syncEnabledEl.addEventListener('change', setUiVisibility);
encryptEnabledEl.addEventListener('change', setUiVisibility);
load();

