// Background service worker for the MV3 extension

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-side-panel') return;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab && typeof activeTab.windowId === 'number') {
      await chrome.sidePanel.open({ windowId: activeTab.windowId });
    } else {
      await chrome.sidePanel.open({});
    }
  } catch (error) {
    // no-op: opening may fail if side panel unsupported in current context
  }
});

