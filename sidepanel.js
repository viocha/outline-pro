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
const menuBtn = document.getElementById('menu-btn');
const dropdownMenu = document.getElementById('dropdown-menu');
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
      // 预处理：规范化层级 (Normalize Levels)
      // 找出当前最小的标签层级 (例如页面只有 h2, h3，则 min=2)
      // 然后将所有层级整体平移，使得最顶层变为 level 1
      const rawHeadings = results[0].result;

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
      } else {
        currentHeadings = [];
      }

      renderTree(currentHeadings);
      updateDropdownMenu(currentHeadings);
    } else {
      container.innerHTML = '<p style="color:gray; font-size:13px; padding:15px; text-align:center;">未发现标题大纲</p>';
      updateDropdownMenu([]);
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
    // 使用规范化后的 level
    const level = h.level;

    // 1. 回溯栈：找到当前节点的正确父容器
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

    // Text
    const text = document.createElement('div');
    text.className = 'toc-text';
    text.innerText = h.text;
    text.title = h.text;

    // 文字点击：总是由于跳转
    text.onclick = (e) => {
      e.stopPropagation();
      jumpTo(index);
    };
    text.ondblclick = (e) => {
      e.stopPropagation();
      selectRange(index);
    };

    // Header 点击逻辑
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

    // 4. 更新父节点的“无子节点”状态
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

// 动态生成下拉菜单
// 动态生成下拉菜单
function updateDropdownMenu(headings) {
  dropdownMenu.innerHTML = '';

  // 标题
  const header = document.createElement('div');
  header.className = 'dropdown-header';
  header.innerText = 'Show Levels';
  dropdownMenu.appendChild(header);

  let maxLevel = 0;
  if (headings && headings.length > 0) {
    headings.forEach(h => {
      // 只要 refreshTOC 中正确计算了 level，这里直接取 level 即可
      // 如果是为了稳健，也可以再次走一遍 tagName 解析
      // 但由于 headings 可能是还没 normalize 的（如果调用时机问题），或者已经 normalize 的。
      // 我们统一在 refreshTOC 中规范化， renderTree 和 updateDropdownMenu 都依赖规范化后的数据。
      const l = h.level || (parseInt(h.tag.substring(1)) - (h.minLevelDifference || 0)); // fallback
      if (l > maxLevel) maxLevel = l;
    });
  }

  // 支持 1 到 6，或者最大层级。用户要求更全面，直到 6。
  // 但最大只到 maxLevel 即可，超过 maxLevel 没有意义（和 expand all 一样）。
  // 为了 UI 统一，我们可以显示到 max(maxLevel, 6) 或者 min(maxLevel, 6) ?
  // 用户说 "把1加上，支持1 到 6 ，更全面"。
  // 我们就循环到 maxLevel，如果 maxLevel < 1，则不显示？
  const limit = Math.max(maxLevel, 1);

  for (let i = 1; i <= limit; i++) {
    if (i > 6) break; // 限制最多到 Level 6
    const item = createDropdownItem(`Level ${i}`, () => expandToLevel(i));
    dropdownMenu.appendChild(item);
  }
}

function createDropdownItem(text, onClick) {
  const div = document.createElement('div');
  div.className = 'dropdown-item';
  div.innerText = text;
  div.onclick = (e) => {
    e.stopPropagation();
    onClick();
    dropdownMenu.classList.remove('show');
  };
  return div;
}

// --- 5. 全局控制 ---

function toggleMenu() {
  dropdownMenu.classList.toggle('show');
}

// 点击外部关闭菜单
document.addEventListener('click', (e) => {
  if (menuBtn && !menuBtn.contains(e.target) && dropdownMenu && !dropdownMenu.contains(e.target)) {
    dropdownMenu.classList.remove('show');
  }
});

if (menuBtn) {
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });
}

// 绑定顶部工具栏按钮
if (collapseAllBtn) {
  collapseAllBtn.addEventListener('click', (e) => {
    e.preventDefault();
    collapseAllNodes();
  });
}

if (expandAllBtn) {
  expandAllBtn.addEventListener('click', (e) => {
    e.preventDefault();
    expandAllNodes();
  });
}

function collapseAllNodes() {
  const nodes = container.querySelectorAll('.toc-node');
  nodes.forEach(node => {
    if (!node.classList.contains('is-leaf')) {
      node.classList.add('is-collapsed');
    }
  });
}

function expandAllNodes() {
  const nodes = container.querySelectorAll('.toc-node');
  nodes.forEach(node => {
    node.classList.remove('is-collapsed');
  });
}

// 展开到指定层级 (Show Level N)
function expandToLevel(targetLevel) {
  const nodes = container.querySelectorAll('.toc-node');
  nodes.forEach(node => {
    const match = node.className.match(/level-(\d+)/);
    if (match) {
      const level = parseInt(match[1]);
      // 如果当前节点层级 < 目标层级，则应该展开（以便显示其子节点）
      // 如果当前节点层级 >= 目标层级，则应该折叠（隐藏其子节点）

      // 例如：Show Level 2 (targetLevel=2)
      // Level 1: 1 < 2 -> remove collapsed (显示 Level 1 子节点即 Level 2)
      // Level 2: 2 >= 2 -> add collapsed (隐藏 Level 2 子节点即 Level 3)

      if (level < targetLevel) {
        node.classList.remove('is-collapsed');
      } else {
        if (!node.classList.contains('is-leaf')) {
          node.classList.add('is-collapsed');
        }
      }
    }
  });
}


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
