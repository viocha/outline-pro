/**
 * Background Service Worker
 */

// Side Panel Opening Logic
// We can set panel behavior to open on action click by default, 
// but we also need to support programmatic opening from content script.

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "SWITCH_TO_FLOATING") {
    // 1. We cannot close the side panel programmatically easily from here if it wasn't the one initiatin?
    // Actually sidepanel.js already called window.close().
    // 2. We need to tell the content script to show the floating panel.
    // The tabId should be passed from sidepanel.js or we use sender.tab.id if from content script.
    const tabId = msg.tabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { action: "SHOW_FLOATING_PANEL" });
    }
  } else if (msg.action === "OPEN_SIDEPANEL") {
    // Chrome 116+ allows opening side panel on user interaction.
    // The message comes from Content Script (user clicked "Switch to Dock").
    // We need to open the side panel for the current window.
    const tabId = sender.tab.id;
    chrome.sidePanel.open({ tabId: tabId, windowId: sender.tab.windowId });
    // Also tell content script to hide floating panel?
    // Or reliance on user logic. Let's send a hide just in case.
    chrome.tabs.sendMessage(tabId, { action: "HIDE_FLOATING_PANEL" });
  }
});
