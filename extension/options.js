const apiKeyEl = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');

async function load() {
  const { openai_api_key } = await chrome.storage.local.get({ openai_api_key: '' });
  apiKeyEl.value = openai_api_key || '';
}

async function save() {
  const key = apiKeyEl.value.trim();
  await chrome.storage.local.set({ openai_api_key: key });
  alert('Saved');
}

async function clearKey() {
  await chrome.storage.local.remove(['openai_api_key']);
  apiKeyEl.value = '';
  alert('Cleared');
}

saveBtn.addEventListener('click', save);
clearBtn.addEventListener('click', clearKey);
load();

