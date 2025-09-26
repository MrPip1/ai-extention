# ChatGPT Side Panel Chrome Extension

Interact with ChatGPT from a Chrome side panel and capture screenshots to include in your prompts.

## Features
- Side panel UI with chat history
- Uses your OpenAI API key (stored locally)
- Capture current tab screenshot and attach to the next message
- Keyboard shortcut to open the side panel (Ctrl+Shift+Y / Cmd+Shift+Y)

## Install (Developer Mode)
1. Build not required. Load the folder directly.
2. Open Chrome → Settings → Extensions → enable Developer mode.
3. Click "Load unpacked" and select the `extension` folder in this repo.
4. Pin the extension if desired, then click it to open the side panel or use the shortcut.

## Setup API Key
1. In the side panel, click the gear icon or go to the extension's Options page.
2. Paste your OpenAI API key (starts with `sk-...`).
3. Save. The key is stored via `chrome.storage.local` in your browser.

## Usage
- Open side panel via toolbar icon or "Ctrl+Shift+Y" (macOS: "Cmd+Shift+Y").
- Type a prompt and press Enter to send (Shift+Enter for newline).
- Click the camera button to capture a screenshot; it will attach to your next message.

## Files
- `extension/manifest.json` — MV3 manifest
- `extension/service_worker.js` — background service worker and command handler
- `extension/sidepanel.html|css|js` — side panel UI and chat logic
- `extension/options.html|css|js` — settings page for the OpenAI API key

## Notes
- Screenshot capture uses `chrome.tabs.captureVisibleTab`. Granting `activeTab` permission allows capture of the current tab. Some pages (e.g., Chrome Web Store, chrome:// URLs) cannot be captured due to browser restrictions.
- API calls are made directly to `https://api.openai.com/v1/chat/completions` using model `gpt-4o-mini`. You can change the model in `sidepanel.js`.
