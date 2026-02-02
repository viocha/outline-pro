/**
 * Outline Side - 核心逻辑脚本
 */

// --- 1. 工具函数 ---

// 防抖函数：避免频繁触发刷新
function debounce(func, wait) {
  let timeout;
  return function () {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, arguments), wait);
  };
}

const container = document.getElementById('toc-container');
const refreshBtn = document.getElementById('refresh-btn');

// --- 2. 核心功能：刷新目录 ---

async function refreshTOC() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // 过滤不可操作页面
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px;">当前页面不支持提取目录</p>';
    return;
  }

  refreshBtn.classList.add('loading');

  try {
    // 注入提取标题的脚本
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const tags = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        return Array.from(tags).map(t => ({
          tag: t.tagName,
          text: t.innerText.trim()
        })).filter(h => h.text.length > 0);
      }
    });

    if (results && results[0]) {
      renderTOC(results[0].result, tab.id);
    }

    // 注入“标题变更哨兵”
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: setupContentObserver
    });

  } catch (err) {
    console.error("刷新失败:", err);
    container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px;">无法读取页面标题</p>';
  } finally {
    // 视觉反馈延迟
    setTimeout(() => refreshBtn.classList.remove('loading'), 500);
  }
}

// --- 3. 渲染 UI 与 交互 ---

function renderTOC(headings, tabId) {
  container.innerHTML = '';
  if (!headings || headings.length === 0) {
    container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px;">未发现标题大纲</p>';
    return;
  }

  headings.forEach((h, index) => {
    const div = document.createElement('div');
    const level = parseInt(h.tag.substring(1));

    div.className = `toc-item h${level}`;
    div.innerText = h.text;
    div.title = "单击跳转，双击选中章节\nClick to navigate, double-click to select chapter.";


    // 动态缩进：H1 为 12px，每级递增 12px
    div.style.paddingLeft = `${(level - 1) * 12 + 12}px`;

    // 单击：平滑跳转
    div.onclick = () => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        args: [index],
        func: (idx) => {
          const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
          if (els[idx]) els[idx].scrollIntoView({ behavior: 'instant', block: 'start' });
        }
      });
    };

    // 双击：智能选中章节范围
    div.ondblclick = () => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        args: [index],
        func: (idx) => {
          const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
          const startNode = els[idx];
          if (!startNode) return;

          const startLevel = parseInt(startNode.tagName.substring(1));
          const parentContainer = startNode.parentElement;

          let endNode = null;
          const allElements = document.querySelectorAll('*');
          let foundStart = false;

          for (let i = 0; i < allElements.length; i++) {
            const node = allElements[i];
            if (node === startNode) { foundStart = true; continue; }
            if (foundStart) {
              // 边界判断逻辑：
              // 1. 遇到同级或更高级标题
              if (/^H[1-6]$/.test(node.tagName)) {
                if (parseInt(node.tagName.substring(1)) <= startLevel) {
                  endNode = node;
                  break;
                }
              }
              // 2. 跑出了父容器（如 div 或 td 结束）
              if (parentContainer && !parentContainer.contains(node)) {
                endNode = node;
                break;
              }
            }
          }

          const range = document.createRange();
          const selection = window.getSelection();
          selection.removeAllRanges();

          range.setStartBefore(startNode);
          if (endNode) {
            range.setEndBefore(endNode);
          } else {
            const boundary = parentContainer ? parentContainer : document.body;
            range.setEndAfter(boundary.lastChild);
          }
          selection.addRange(range);
          startNode.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      });
    };

    container.appendChild(div);
  });
}

// --- 4. 页面监听脚本（在目标网页运行） ---

function setupContentObserver() {
  if (window.hasOutlineObserver) return;
  window.hasOutlineObserver = true;

  // 内置防抖函数
  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // 发送更新通知
  const sendUpdate = debounce(() => {
    chrome.runtime.sendMessage({ action: "AUTO_REFRESH" });
  }, 300);

  const observer = new MutationObserver((mutations) => {
    let shouldRefresh = false;

    for (const mutation of mutations) {
      // 1. 文本内容变化：检查父节点是否为标题
      if (mutation.type === 'characterData') {
        if (mutation.target.parentNode && /^H[1-6]$/i.test(mutation.target.parentNode.tagName)) {
          shouldRefresh = true;
          break;
        }
      }
      // 2. 节点增删：检查是否涉及标题元素
      else if (mutation.type === 'childList') {
        // 检查新增节点
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) { // 元素节点
            if (/^H[1-6]$/i.test(node.tagName) || node.querySelector('h1, h2, h3, h4, h5, h6')) {
              shouldRefresh = true;
              break;
            }
          }
        }
        if (shouldRefresh) break;

        // 检查移除节点
        for (const node of mutation.removedNodes) {
          if (node.nodeType === 1) { // 元素节点
            if (/^H[1-6]$/i.test(node.tagName) || node.querySelector('h1, h2, h3, h4, h5, h6')) {
              shouldRefresh = true;
              break;
            }
          }
        }
        if (shouldRefresh) break;

        // 检查目标节点本身是否为标题（例如插入 span 到 h1 中）
        if (mutation.target && mutation.target.tagName && /^H[1-6]$/i.test(mutation.target.tagName)) {
          shouldRefresh = true;
          break;
        }
      }
    }

    if (shouldRefresh) {
      sendUpdate();
    }
  });

  // 观察整个 body 的变化
  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}

// --- 5. 事件绑定与自动运行 ---

const debouncedRefresh = debounce(refreshTOC, 300);

// 监听手动刷新点击
refreshBtn.addEventListener('click', (e) => {
  e.preventDefault();
  refreshTOC();
});

// 监听来自网页哨兵的消息
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "AUTO_REFRESH") debouncedRefresh();
});

// 监听标签页切换或更新
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete' && tab.active) debouncedRefresh();
});

chrome.tabs.onActivated.addListener(debouncedRefresh);

// 启动初始化
refreshTOC();
