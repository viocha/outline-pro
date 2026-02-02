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
    const tabId = msg.tabId;
    if (tabId) {
      // Try sending message first
      chrome.tabs.sendMessage(tabId, { action: "SHOW_FLOATING_PANEL" })
        .catch(async (err) => {
          // If content script is not ready/listening, we inject it.
          console.log("Floating panel script not ready, injecting...", err);
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['floating-panel.js']
            });
            // Retry message after injection
            // Give it a small moment to initialize listener
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { action: "SHOW_FLOATING_PANEL" });
            }, 100);
          } catch (injectErr) {
            console.error("Failed to inject floating panel script", injectErr);
          }
        });
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
