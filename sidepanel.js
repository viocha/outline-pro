/**
 * 侧边栏核心逻辑脚本 - Refactored to use OutlineRenderer
 */
import { OutlineRenderer } from './outline-renderer.js';

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// UI 元素
const container = document.getElementById('toc-container');
const refreshBtn = document.getElementById('refresh-btn');
const menuBtn = document.getElementById('menu-btn');
const dropdownMenu = document.getElementById('dropdown-menu');
const collapseAllBtn = document.getElementById('collapse-all-btn');
const expandAllBtn = document.getElementById('expand-all-btn');
const switchModeBtn = document.getElementById('switch-mode-btn');

// 状态
let currentTabId = null;

// 初始化 Renderer
const renderer = new OutlineRenderer(container, {
  onJump: (index) => jumpTo(index),
  onHighlight: (index) => selectRange(index),
  onMenuAction: () => dropdownMenu.classList.remove('show')
});

// --- 核心功能：刷新与数据获取 ---

async function refreshTOC() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px; text-align:center;">当前页面不支持</p>';
    return;
  }

  currentTabId = tab.id;
  refreshBtn.classList.add('loading');

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const tags = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(tags).map(t => ({
          tag: t.tagName,
          text: t.textContent.trim(),
          id: t.id
        })).filter(h => h.text.length > 0);
      }
    });

    if (results && results[0]) {
      const rawHeadings = results[0].result;
      let currentHeadings = [];

      if (rawHeadings.length > 0) {
        let minLevel = 6;
        rawHeadings.forEach(h => {
          const l = parseInt(h.tag.substring(1));
          if (l < minLevel) minLevel = l;
        });

        currentHeadings = rawHeadings.map(h => ({
          ...h,
          level: parseInt(h.tag.substring(1)) - minLevel + 1
        }));
      }

      renderer.render(currentHeadings);

      // Update Dropdown
      dropdownMenu.innerHTML = '';
      const dropdownContent = renderer.createDropdownContent(currentHeadings);
      dropdownMenu.appendChild(dropdownContent);

    } else {
      container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px; text-align:center;">未发现标题大纲</p>';
      dropdownMenu.innerHTML = '';
    }

    // 注入内容观察者
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: setupContentObserver
    });

  } catch (err) {
    console.error("刷新失败:", err);
    container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px; text-align:center;">无法读取页面</p>';
  } finally {
    setTimeout(() => refreshBtn.classList.remove('loading'), 500);
  }
}

// --- 交互操作 (Chrome Scripting) ---

function jumpTo(index) {
  if (currentTabId === null) return;
  chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    args: [index],
    func: (idx) => {
      const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      if (els[idx]) els[idx].scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  });
}

function selectRange(index) {
  if (currentTabId === null) return;
  chrome.scripting.executeScript({
    target: { tabId: currentTabId },
    args: [index],
    func: (idx) => {
      const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const startNode = els[idx];
      if (!startNode) return;

      const range = document.createRange();
      const selection = window.getSelection();
      selection.removeAllRanges();

      range.selectNodeContents(startNode);
      selection.addRange(range);
      startNode.scrollIntoView({ behavior: 'instant', block: 'center' });

      setTimeout(() => {
        selection.removeAllRanges();
      }, 500);
    }
  });
}


// --- 页面监控 ---

function setupContentObserver() {
  if (window.hasOutlineObserver) return;
  window.hasOutlineObserver = true;

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
  const sendUpdate = debounce(() => {
    chrome.runtime.sendMessage({ action: "AUTO_REFRESH" });
  }, 300);

  const observer = new MutationObserver((mutations) => {
    let shouldRefresh = false;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        if (mutation.target.parentNode && /^H[1-6]$/i.test(mutation.target.parentNode.tagName)) {
          shouldRefresh = true; break;
        }
      } else if (mutation.type === 'childList') {
        const checkNode = (n) => n.nodeType === 1 && (/^H[1-6]$/i.test(n.tagName) || n.querySelector('h1,h2,h3,h4,h5,h6'));
        for (const node of mutation.addedNodes) { if (checkNode(node)) { shouldRefresh = true; break; } }
        if (!shouldRefresh) for (const node of mutation.removedNodes) { if (checkNode(node)) { shouldRefresh = true; break; } }
        if (!shouldRefresh && mutation.target && mutation.target.tagName && /^H[1-6]$/i.test(mutation.target.tagName)) {
          shouldRefresh = true;
        }
      }
      if (shouldRefresh) break;
    }
    if (shouldRefresh) sendUpdate();
  });

  if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

// --- 事件绑定 ---

const debouncedRefresh = debounce(refreshTOC, 300);

refreshBtn.addEventListener('click', (e) => {
  e.preventDefault();
  refreshBtn.classList.add('loading');
  refreshTOC().finally(() => refreshBtn.classList.remove('loading'));
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "AUTO_REFRESH") debouncedRefresh();
});
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete' && tab.active) debouncedRefresh();
});
chrome.tabs.onActivated.addListener(debouncedRefresh);

// Dropdown Menu Control
if (menuBtn) {
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu.classList.toggle('show');
  });
}
document.addEventListener('click', (e) => {
  if (menuBtn && !menuBtn.contains(e.target) && dropdownMenu && !dropdownMenu.contains(e.target)) {
    dropdownMenu.classList.remove('show');
  }
});

// Collapse/Expand Utils
if (collapseAllBtn) {
  collapseAllBtn.addEventListener('click', (e) => {
    e.preventDefault();
    renderer.collapseAll();
  });
}

if (expandAllBtn) {
  expandAllBtn.addEventListener('click', (e) => {
    e.preventDefault();
    renderer.expandAll();
  });
}

// Switch Mode
if (switchModeBtn) {
  switchModeBtn.addEventListener('click', async () => {
    // 1. Send message to background to enable floating mode for this tab
    // 2. Close this side panel

    try {
      await chrome.runtime.sendMessage({
        action: "SWITCH_TO_FLOATING",
        tabId: currentTabId
      });
      // Close window if possible
      window.close();
    } catch (e) {
      console.error("Switch failed", e);
    }
  });
}

// Listen for close command
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "CLOSE_SIDEPANEL") {
    window.close();
  }
});

// Notify that sidepanel is open (to close floating)
chrome.runtime.sendMessage({ action: "SIDEPANEL_OPENED" }).catch(() => { });

// 启动
refreshTOC();
