const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const sleekToggleBtn = document.getElementById('sleekToggleBtn');
const openOptionsBtn = document.getElementById('openOptionsBtn');
const bannerOpenOptionsBtn = document.getElementById('bannerOpenOptionsBtn');
const apiKeyBannerEl = document.getElementById('apiKeyBanner');
const attachmentPreviewEl = document.getElementById('attachmentPreview');
const captureMethodEl = document.getElementById('captureMethod');
const captureQualityEl = document.getElementById('captureQuality');

let state = {
  apiKey: null,
  messages: [],
  pendingAttachment: null, // { dataUrl, mime }
  isSending: false,
  sleekMode: false,
};

function setBannerVisible(visible) {
  if (visible) apiKeyBannerEl.classList.remove('hidden');
  else apiKeyBannerEl.classList.add('hidden');
}

function renderMessages() {
  messagesEl.innerHTML = '';
  for (const message of state.messages) {
    const wrapper = document.createElement('div');
    wrapper.className = `msg ${message.role}`;

    const role = document.createElement('div');
    role.className = 'role';
    role.textContent = message.role === 'assistant' ? 'Assistant' : 'You';
    wrapper.appendChild(role);

    const content = document.createElement('div');
    content.className = 'content';
    content.textContent = message.text || '';
    wrapper.appendChild(content);

    if (Array.isArray(message.images)) {
      for (const url of message.images) {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'attachment';
        img.alt = 'attachment';
        wrapper.appendChild(img);
      }
    }

    messagesEl.appendChild(wrapper);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderAttachmentPreview() {
  if (!state.pendingAttachment) {
    attachmentPreviewEl.classList.add('hidden');
    attachmentPreviewEl.innerHTML = '';
    return;
  }
  attachmentPreviewEl.classList.remove('hidden');
  attachmentPreviewEl.innerHTML = '';
  const img = document.createElement('img');
  img.src = state.pendingAttachment.dataUrl;
  img.alt = 'pending attachment';
  const remove = document.createElement('button');
  remove.textContent = 'Remove';
  remove.className = 'remove';
  remove.addEventListener('click', () => {
    state.pendingAttachment = null;
    renderAttachmentPreview();
  });
  attachmentPreviewEl.appendChild(img);
  attachmentPreviewEl.appendChild(remove);
}

function setSending(isSending) {
  state.isSending = isSending;
  sendBtn.disabled = isSending || !state.apiKey;
  inputEl.disabled = isSending;
}

async function loadState() {
  const stored = await chrome.storage.local.get({ openai_api_key: null, chat_history: [], sync_enabled: false, sleek_mode: false, capture_method: 'dom', capture_quality: 'medium' });
  let apiKey = stored.openai_api_key;
  if (!apiKey && stored.sync_enabled) {
    // Auto-import plaintext key from sync if available
    try {
      const { openai_api_key_sync } = await chrome.storage.sync.get({ openai_api_key_sync: null });
      if (typeof openai_api_key_sync === 'string' && openai_api_key_sync) {
        apiKey = openai_api_key_sync;
        await chrome.storage.local.set({ openai_api_key: apiKey });
      }
    } catch (_e) {}
  }
  state.apiKey = apiKey;
  state.messages = Array.isArray(stored.chat_history) ? stored.chat_history : [];
  state.sleekMode = !!stored.sleek_mode;
  setBannerVisible(!state.apiKey);
  setSending(false);
  renderMessages();
  applySleekMode();
  // init capture prefs
  if (captureMethodEl) captureMethodEl.value = stored.capture_method || 'dom';
  if (captureQualityEl) captureQualityEl.value = stored.capture_quality || 'medium';
}

async function saveHistory() {
  await chrome.storage.local.set({ chat_history: state.messages });
}

function buildUserContent(text, imageDataUrl) {
  if (!imageDataUrl) return text;
  return [
    { type: 'text', text },
    { type: 'image_url', image_url: { url: imageDataUrl } },
  ];
}

function applySleekMode() {
  if (state.sleekMode) {
    document.body.classList.add('sleek');
  } else {
    document.body.classList.remove('sleek');
  }
}

// removed cloak helpers

async function toggleSleekMode() {
  state.sleekMode = !state.sleekMode;
  applySleekMode();
  await chrome.storage.local.set({ sleek_mode: state.sleekMode });
}

// Hold Space to temporarily reveal while pressed
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && state.sleekMode) {
    document.body.classList.add('sleek-hold-reveal');
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && state.sleekMode) {
    document.body.classList.remove('sleek-hold-reveal');
  }
});

async function captureViaDisplayMedia() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('Screen capture API unavailable in this context.');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 1 },
    audio: false,
  });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        video.onloadedmetadata = null;
        video.oncanplay = null;
        video.onerror = null;
      };
      video.onloadedmetadata = () => {
        video.play().then(() => resolve()).catch(reject);
      };
      video.oncanplay = () => resolve();
      video.onerror = () => reject(new Error('Screen capture video error'));
    });
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl;
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

async function callOpenAI(userContent) {
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a helpful assistant inside a Chrome extension side panel. Be concise.' },
      ...state.messages.map((m) => {
        const content = [];
        if (m.text) content.push({ type: 'text', text: m.text });
        if (Array.isArray(m.images)) {
          for (const url of m.images) content.push({ type: 'image_url', image_url: { url } });
        }
        return { role: m.role, content: content.length ? content : m.text || '' };
      }),
      { role: 'user', content: userContent },
    ],
    temperature: 0.3,
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const choice = data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content;
  return typeof content === 'string' ? content : '';
}

async function onSend() {
  const text = (inputEl.value || '').trim();
  const hasImage = !!state.pendingAttachment;
  if (!text && !hasImage) return;
  if (!state.apiKey) {
    setBannerVisible(true);
    return;
  }

  const userMsg = { role: 'user', text, images: hasImage ? [state.pendingAttachment.dataUrl] : [] };
  state.messages.push(userMsg);
  state.pendingAttachment = null;
  inputEl.value = '';
  renderAttachmentPreview();
  renderMessages();
  await saveHistory();

  setSending(true);
  try {
    const userContent = buildUserContent(text, userMsg.images[0]);
    const replyText = await callOpenAI(userContent);
    state.messages.push({ role: 'assistant', text: replyText });
  } catch (err) {
    state.messages.push({ role: 'assistant', text: `Error: ${err.message}` });
  } finally {
    setSending(false);
    renderMessages();
    await saveHistory();
    inputEl.focus();
  }
}

async function captureScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || typeof tab.id !== 'number') throw new Error('No active tab');
    const tabId = tab.id;
    const url = tab.url || '';
    const method = (captureMethodEl && captureMethodEl.value) || 'dom';
    const quality = (captureQualityEl && captureQualityEl.value) || 'medium';
    const qualityToParams = {
      low: { maxWidth: 960, jpegQuality: 0.55 },
      medium: { maxWidth: 1280, jpegQuality: 0.7 },
      high: { maxWidth: 1600, jpegQuality: 0.85 },
    };
    const params = qualityToParams[quality] || qualityToParams.medium;

    // Block restricted schemes/hosts where content scripts cannot run
    const restrictedScheme = /^(chrome:|chrome-devtools:|chrome-extension:)/i.test(url);
    const restrictedHost = /(^|\.)chrome\.google\.com$/i.test(new URL(url).hostname || '') || /(^|\.)chromewebstore\.google\.com$/i.test(new URL(url).hostname || '');
    const isRestricted = restrictedScheme || restrictedHost;

    async function trySendOnce() {
      return await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_DOM_CANVAS', maxWidth: params.maxWidth, jpegQuality: params.jpegQuality }, (res) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          if (!res || !res.ok) {
            reject(new Error((res && res.error) || 'Capture failed'));
            return;
          }
          resolve(res.dataUrl);
        });
      });
    }

    let dataUrl;
    if (method === 'dom') {
      if (isRestricted) throw new Error('This page cannot be captured due to browser restrictions.');
      try {
        // First try assuming the content script is already present
        dataUrl = await trySendOnce();
      } catch (_firstErr) {
        // Inject content script on demand, then retry
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content/capture_dom.js'] });
        dataUrl = await trySendOnce();
      }
    } else if (method === 'tab') {
      // Built-in tab capture, then downscale+JPEG to reduce memory
      const windowId = tab && tab.windowId;
      const pngUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
      dataUrl = await downscaleDataUrl(pngUrl, params.maxWidth, params.jpegQuality);
    } else {
      // screen method
      const pngUrl = await captureViaDisplayMedia();
      dataUrl = await downscaleDataUrl(pngUrl, params.maxWidth, params.jpegQuality);
    }

    state.pendingAttachment = { dataUrl, mime: 'image/png' };
    renderAttachmentPreview();
  } catch (err) {
    state.pendingAttachment = null;
    renderAttachmentPreview();
    state.messages.push({ role: 'assistant', text: `Screenshot failed: ${err && err.message ? err.message : String(err)}` });
    renderMessages();
  }
}

async function downscaleDataUrl(srcDataUrl, maxWidth, jpegQuality) {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, (maxWidth || 1280) / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const q = typeof jpegQuality === 'number' ? Math.max(0.3, Math.min(0.95, jpegQuality)) : 0.7;
        resolve(canvas.toDataURL('image/jpeg', q));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Downscale failed'));
    img.src = srcDataUrl;
  });
}

openOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
bannerOpenOptionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
sendBtn.addEventListener('click', onSend);
screenshotBtn.addEventListener('click', captureScreenshot);
sleekToggleBtn.addEventListener('click', toggleSleekMode);

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
});

// Watch for API key changes from options
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.openai_api_key) {
    state.apiKey = changes.openai_api_key.newValue || null;
    setBannerVisible(!state.apiKey);
    setSending(false);
  }
  if (changes.sleek_mode) {
    state.sleekMode = !!changes.sleek_mode.newValue;
    applySleekMode();
  }
});

loadState();

