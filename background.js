/**
 * Background Service Worker
 */

// Initialize Context Menus
chrome.runtime.onInstalled.addListener(() => {
  // Clear existing to avoid ID conflicts during reload/update
  chrome.contextMenus.removeAll(() => {
    // Menu support for Page (Right click on page)
    chrome.contextMenus.create({
      id: "open_sidebar",
      title: "Open Sidebar Outline",
      contexts: ["page", "selection", "link", "editable"]
    });
    chrome.contextMenus.create({
      id: "open_floating_page",
      title: "Open Floating Outline",
      contexts: ["page", "selection", "link", "editable"]
    });

    // Menu support for Extension Icon (Right click on toolbar icon)
    chrome.contextMenus.create({
      id: "open_floating_action",
      title: "Open Floating Outline",
      contexts: ["action"]
    });
  });
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open_sidebar") {
    openSidePanel(tab);
  } else if (info.menuItemId === "open_floating_page" || info.menuItemId === "open_floating_action") {
    chrome.runtime.sendMessage({ action: "CLOSE_SIDEPANEL" }).catch(() => { });
    toggleFloatingPanel(tab.id, "SHOW_FLOATING_PANEL");
  }
});

// Handle Keyboard Shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-floating-outline") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        // Enforce exclusivity: Close sidebar if we are toggling floating (likely opening)
        // If we are closing, it doesn't hurt.
        chrome.runtime.sendMessage({ action: "CLOSE_SIDEPANEL" }).catch(() => { });
        toggleFloatingPanel(tabs[0].id, "TOGGLE_FLOATING_PANEL");
      }
    });
  }
});


// Side Panel Behavior
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Message Handling
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "SWITCH_TO_FLOATING") {
    const tabId = msg.tabId;
    if (tabId) {
      toggleFloatingPanel(tabId, "SHOW_FLOATING_PANEL");
    }
  } else if (msg.action === "OPEN_SIDEPANEL") {
    const tab = sender.tab;
    openSidePanel(tab);
    // Floating panel will be hidden by SIDEPANEL_OPENED logic or explicit hide
    chrome.tabs.sendMessage(tab.id, { action: "HIDE_FLOATING_PANEL" }).catch(() => { });
  } else if (msg.action === "SIDEPANEL_OPENED") {
    // When sidepanel reports it is open, ensure floating panel is hidden for that tab
    // We need to know which tab the sidepanel is associated with.
    // The sender usually contains the tab info if opened for a tab.
    if (sender.tab && sender.tab.id) {
      chrome.tabs.sendMessage(sender.tab.id, { action: "HIDE_FLOATING_PANEL" }).catch(() => { });
    } else {
      // If undefined, try active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: "HIDE_FLOATING_PANEL" }).catch(() => { });
      });
    }
  }
});

function openSidePanel(tab) {
  // Open side panel for the specific window
  chrome.sidePanel.open({ tabId: tab.id, windowId: tab.windowId })
    .catch(err => console.error("Failed to open side panel", err));
}

function toggleFloatingPanel(tabId, actionType) {
  // Try sending message first
  chrome.tabs.sendMessage(tabId, { action: actionType })
    .catch(async (err) => {
      // If content script is not ready/listening, we inject it.
      // Note: Only inject if we are trying to SHOW or TOGGLE. Hiding usually implies it's there, but safe to ignore if not.
      if (actionType === "HIDE_FLOATING_PANEL") return;

      console.log("Floating panel script not ready or failed, injecting...", err);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['floating-panel.js']
        });
        // Retry message after injection
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { action: actionType }).catch(e => console.error("Retry failed", e));
        }, 100);
      } catch (injectErr) {
        console.error("Failed to inject floating panel script", injectErr);
      }
    });
}

// --- Tab-Scoped State Management ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "SAVE_FLOATING_STATE") {
    // Save state keyed by tabId
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId && msg.state) {
      const key = `floating_state_${tabId}`;
      chrome.storage.local.set({ [key]: msg.state });
    }
  } else if (msg.action === "GET_FLOATING_STATE") {
    // Retrieve state for this tab
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      const key = `floating_state_${tabId}`;
      chrome.storage.local.get(key, (data) => {
        sendResponse(data[key] || null);
      });
      return true; // Keep channel open for async response
    } else {
      sendResponse(null);
    }
  }
});

// Cleanup state when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const key = `floating_state_${tabId}`;
  chrome.storage.local.remove(key);
});
