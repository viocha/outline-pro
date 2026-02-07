/**
 * Background Service Worker
 */
export default defineBackground(() => {
  // Initialize Context Menus
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'open_sidebar',
        title: 'Open Sidebar Outline',
        contexts: ['page', 'selection', 'link', 'editable'],
      });
      chrome.contextMenus.create({
        id: 'open_floating_page',
        title: 'Open Floating Outline',
        contexts: ['page', 'selection', 'link', 'editable'],
      });
      chrome.contextMenus.create({
        id: 'open_floating_action',
        title: 'Open Floating Outline',
        contexts: ['action'],
      });
    });
  });

  // Handle Context Menu Clicks
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;
    if (info.menuItemId === 'open_sidebar') {
      openSidePanel(tab);
    } else if (
      info.menuItemId === 'open_floating_page' ||
      info.menuItemId === 'open_floating_action'
    ) {
      chrome.runtime.sendMessage({ action: 'CLOSE_SIDEPANEL' }).catch(() => {});
      toggleFloatingPanel(tab.id, 'SHOW_FLOATING_PANEL');
    }
  });

  // Handle Keyboard Shortcuts
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'toggle-floating-outline') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.runtime.sendMessage({ action: 'CLOSE_SIDEPANEL' }).catch(() => {});
          toggleFloatingPanel(tabs[0].id, 'TOGGLE_FLOATING_PANEL');
        }
      });
    }
  });

  // Side Panel Behavior - open on action click
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

  // Message Handling - primary router
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'SWITCH_TO_FLOATING') {
      const tabId = msg.tabId;
      if (tabId) {
        toggleFloatingPanel(tabId, 'SHOW_FLOATING_PANEL');
      }
    } else if (msg.action === 'OPEN_SIDEPANEL') {
      const tab = sender.tab;
      if (tab?.id) {
        openSidePanel(tab);
        chrome.tabs.sendMessage(tab.id, { action: 'HIDE_FLOATING_PANEL' }).catch(() => {});
      }
    } else if (msg.action === 'SIDEPANEL_OPENED') {
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, { action: 'HIDE_FLOATING_PANEL' }).catch(() => {});
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'HIDE_FLOATING_PANEL' }).catch(() => {});
          }
        });
      }
    }
  });

  // Tab-Scoped State Management
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'SAVE_FLOATING_STATE') {
      const tabId = sender.tab?.id;
      if (tabId && msg.state) {
        const key = `floating_state_${tabId}`;
        chrome.storage.local.set({ [key]: msg.state });
      }
    } else if (msg.action === 'GET_FLOATING_STATE') {
      const tabId = sender.tab?.id;
      if (tabId) {
        const key = `floating_state_${tabId}`;
        chrome.storage.local.get(key, (data) => {
          sendResponse(data[key] || null);
        });
        return true; // async sendResponse
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

  // Inherit state from opener tab (same host)
  chrome.tabs.onCreated.addListener(async (tab) => {
    if (tab.openerTabId) {
      try {
        const openerTab = await chrome.tabs.get(tab.openerTabId);
				debugger;
        const getHost = (url?: string) => {
          try {
            return url ? new URL(url).host : null;
          } catch {
            return null;
          }
        };
        const openerHost = getHost(openerTab.url);
        const newTabHost = getHost(tab.pendingUrl || tab.url);
        if (openerHost && newTabHost && openerHost === newTabHost) {
          const openerKey = `floating_state_${tab.openerTabId}`;
          const data = await chrome.storage.local.get(openerKey);
          const openerState = data[openerKey];
          if (openerState?.isVisible && tab.id) {
            const newKey = `floating_state_${tab.id}`;
            await chrome.storage.local.set({ [newKey]: openerState });
          }
        }
      } catch {
        // ignore
      }
    }
  });

  function openSidePanel(tab: chrome.tabs.Tab) {
    if (!tab.id || !tab.windowId) return;
    chrome.sidePanel
      .open({ tabId: tab.id, windowId: tab.windowId })
      .catch((err) => console.error('Failed to open side panel', err));
  }

  function toggleFloatingPanel(tabId: number, actionType: string) {
    chrome.tabs.sendMessage(tabId, { action: actionType }).catch(async (err) => {
      if (actionType === 'HIDE_FLOATING_PANEL') return;
      console.log('Floating panel script not ready, injecting...', err);
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content-scripts/floating.js'],
        });
        setTimeout(() => {
          chrome.tabs
            .sendMessage(tabId, { action: actionType })
            .catch((e) => console.error('Retry failed', e));
        }, 100);
      } catch (injectErr) {
        console.error('Failed to inject floating panel script', injectErr);
      }
    });
  }
});
