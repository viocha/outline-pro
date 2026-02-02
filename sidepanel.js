/**
 * Outline Side - 核心逻辑脚本 (Nested Tree Version)
 */

// --- 1. 工具函数 ---

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
const collapseAllBtn = document.getElementById('collapse-all-btn');
const expandAllBtn = document.getElementById('expand-all-btn');

// 状态
let currentHeadings = [];
let currentTabId = null;

// --- 2. 核心功能：刷新与数据获取 ---

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
          text: t.innerText.trim(),
          id: t.id
        })).filter(h => h.text.length > 0);
      }
    });

    if (results && results[0]) {
      currentHeadings = results[0].result;
      renderTree(currentHeadings);
    } else {
      container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px; text-align:center;">未发现标题大纲</p>';
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

// --- 3. 渲染逻辑 (Stack-based Nested Tree) ---

function renderTree(headings) {
  container.innerHTML = '';

  if (!headings || headings.length === 0) {
    container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px; text-align:center;">未发现标题</p>';
    return;
  }

  // 虚拟根节点，level 0
  const rootDiv = document.createElement('div');
  const stack = [{ element: rootDiv, level: 0 }];

  headings.forEach((h, index) => {
    const level = parseInt(h.tag.substring(1));

    // 1. 回溯栈：找到当前节点的正确父容器
    // 规则：只要栈顶元素的 level >= 当前 level，就说明栈顶范围结束了，出栈
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parentEntry = stack[stack.length - 1];

    // 2. 创建当前节点结构
    const node = document.createElement('div');
    node.className = `toc-node level-${level}`;
    node.dataset.index = index;

    // Header
    const header = document.createElement('div');
    header.className = 'toc-header';

    // Icon
    const icon = document.createElement('div');
    icon.className = 'toggle-icon';
    icon.innerHTML = '<svg viewBox="0 0 16 16"><path d="M4.646 6.354l3.328 3.329 3.328-3.329c.195-.195.512-.195.707 0s.195.512 0 .707l-3.683 3.682c-.195.195-.512.195-.707 0L4.293 7.06a.5.5 0 0 1 .453-.806z"/></svg>';
    // icon click event handled by header bubbling or ignored if we rely purely on header
    // Removed specific onclick to rely on header logic or just let bubbling happen?
    // User wants icon to toggle. Header logic handles "if not leaf -> toggle".
    // Icon is inside header. Bubble -> Header -> Toggle.
    // So we don't need a specific handler here unless we want to stopProp?
    // If we stopProp on icon, header won't fire. But we WANT header logic.
    // So deleting this block is correct.

    // Text
    const text = document.createElement('div');
    text.className = 'toc-text';
    text.innerText = h.text;
    text.title = h.text;

    // 文字点击：总是由于跳转。阻止冒泡，避免触发 Header 层的折叠逻辑
    text.onclick = (e) => {
      e.stopPropagation();
      jumpTo(index);
    };
    text.ondblclick = (e) => {
      e.stopPropagation();
      selectRange(index);
    };

    // Header 点击逻辑：
    // 1. 如果是叶子节点 -> 跳转
    // 2. 如果是父节点 -> 折叠/展开 (icon 和 空白区域都触发此逻辑)
    header.onclick = () => {
      if (node.classList.contains('is-leaf')) {
        jumpTo(index);
      } else {
        toggleNode(node);
      }
    };

    header.appendChild(icon);
    header.appendChild(text);

    // Children Container
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'toc-children';

    node.appendChild(header);
    node.appendChild(childrenContainer);

    // 3. 挂载
    parentEntry.element.appendChild(node);

    // 4. 更新父节点的“无子节点”状态 (is-leaf)
    if (parentEntry.nodeRef) {
      parentEntry.nodeRef.classList.remove('is-leaf');
    }

    // 默认当前是叶子
    node.classList.add('is-leaf');

    // 入栈
    stack.push({
      element: childrenContainer,
      level: level,
      nodeRef: node
    });
  });

  // 将构建好的 DOM 树插入页面，忽略 rootDiv 本身，只取其 children
  // (其实 headings 是同级的，所以可能有多个 root 节点，append rootDiv 下的所有子元素更安全，或者直接 append rootDiv 但 rootDiv 没样式)
  // 我们直接 append rootDiv 的 children
  while (rootDiv.firstChild) {
    container.appendChild(rootDiv.firstChild);
  }
}

// --- 4. 交互操作 ---

function toggleNode(node) {
  if (node.classList.contains('is-collapsed')) {
    node.classList.remove('is-collapsed');
  } else {
    node.classList.add('is-collapsed');
  }
}

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

      const startLevel = parseInt(startNode.tagName.substring(1));
      const parentContainer = startNode.parentElement; // 获取父元素作为边界参考

      let endNode = null;
      // 这里的逻辑需要更健壮：找到“下一个同级或高级标题”之前的那个元素
      // 简单起见，从 startNode 开始往下找

      // 实际上，双击选中范围在复杂DOM中很难完美。这里保留原有的简单逻辑或稍作改进
      // 原有逻辑：遍历所有元素？太慢。
      // 新逻辑：Range 选中当前标题即可，或者选中标题所在行。
      // 用户之前有“选中章节范围”的需求，我们保留类似逻辑但简化

      const range = document.createRange();
      const selection = window.getSelection();
      selection.removeAllRanges();

      range.selectNodeContents(startNode);
      // 如果要选中整个段落，需要复杂解析。暂时只选中标题本身，响应更快。
      selection.addRange(range);
      startNode.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  });
}

// --- 5. 全局控制 ---

// 一键折叠：将所有非叶子节点设为 collapsed
collapseAllBtn.addEventListener('click', () => {
  const nodes = container.querySelectorAll('.toc-node');
  nodes.forEach(node => {
    if (!node.classList.contains('is-leaf')) {
      node.classList.add('is-collapsed');
    }
  });
});

expandAllBtn.addEventListener('click', () => {
  const nodes = container.querySelectorAll('.toc-node');
  nodes.forEach(node => {
    node.classList.remove('is-collapsed');
  });
});


// --- 6. 页面监控 ---

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
        // 快速扫描节点
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

// 事件绑定
const debouncedRefresh = debounce(refreshTOC, 300);

refreshBtn.addEventListener('click', (e) => {
  e.preventDefault();
  refreshBtn.classList.add('loading');
  refreshTOC().finally(() => refreshBtn.classList.remove('loading'));
  // 注意：refreshTOC 内部也有 loading 控制，这里加一下为了立刻响应点击
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "AUTO_REFRESH") debouncedRefresh();
});
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete' && tab.active) debouncedRefresh();
});
chrome.tabs.onActivated.addListener(debouncedRefresh);

// 启动
refreshTOC();
