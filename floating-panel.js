/**
 * Floating Panel Content Script
 * Handles the floating UI, Drag & Drop, and messaging.
 */

if (window.hasRunFloatingPanel) {
    // Already running, just ensure listeners might stay active (they persist).
    // Actually if we re-inject, we don't want to re-add listeners if they are already there.
    // Return early.
    throw new Error("Script already running"); // throw to stop execution or just return
}
window.hasRunFloatingPanel = true;

let overlayContainer = null;
let shadowRoot = null;
let panel = null;
let renderer = null;

// Listen for messages from Background or Side Panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "SHOW_FLOATING_PANEL") {
        showPanel();
    } else if (msg.action === "HIDE_FLOATING_PANEL") {
        hidePanel();
    } else if (msg.action === "TOGGLE_FLOATING_PANEL") {
        if (overlayContainer && overlayContainer.style.display !== 'none') {
            hidePanel();
        } else {
            showPanel();
        }
    }
});

async function showPanel() {
    if (overlayContainer) {
        overlayContainer.style.display = 'block';
        refreshTOC(); // Refresh on show
        return;
    }

    // Initial Setup
    await createPanelUI();
    refreshTOC();
    setupContentObserver();
}

function hidePanel() {
    if (overlayContainer) {
        overlayContainer.style.display = 'none';
    }
}

async function createPanelUI() {
    // 1. Create Host
    overlayContainer = document.createElement('div');
    overlayContainer.id = 'outline-floating-host';
    overlayContainer.style.position = 'fixed';
    overlayContainer.style.top = '100px';
    overlayContainer.style.right = '20px';
    overlayContainer.style.width = '300px';
    overlayContainer.style.height = '400px'; // Initial height
    overlayContainer.style.zIndex = '2147483647'; // Max z-index
    overlayContainer.style.display = 'block';
    // Shadow DOM to isolate styles
    shadowRoot = overlayContainer.attachShadow({ mode: 'open' });

    // 2. Inject Styles
    const linkElem = document.createElement('link');
    linkElem.setAttribute('rel', 'stylesheet');
    linkElem.setAttribute('href', chrome.runtime.getURL('outline.css'));
    shadowRoot.appendChild(linkElem);

    // Additional floating specific styles
    const style = document.createElement('style');
    style.textContent = `
    :host {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --primary-color: #007bff;
      --bg-hover: #f0f7ff;
    }
    #panel-container {
      position: relative;
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
      transition: opacity 0.2s;
    }
    header {
      cursor: move; /* Drag handle */
      user-select: none;
      padding-right: 8px;
    }
    /* Ensure the drag area (title) takes available space */
    .header-title {
        flex: 1;
        cursor: move;
    }
    /* Button group container */
    .header-actions {
        display: flex;
        gap: 2px;
        align-items: center;
    }
    #toc-container {
      flex: 1;
      overflow: auto;
      overscroll-behavior: none;
    }
    /* Simple Resizer */
    .resizer {
      width: 24px; /* Larger hit area */
      height: 24px;
      position: absolute;
      bottom: 0;
      right: 0;
      cursor: se-resize;
      z-index: 20;
    }
    /* Visual mark */
    .resizer::after {
      content: '';
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 16px;
      height: 16px;
      -webkit-mask-image: url('data:image/svg+xml;charset=UTF-8,%3Csvg%20viewBox%3D%220%200%2012%2012%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M8%2010L10%208M4%2010L10%204%22%20stroke%3D%22black%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E');
      -webkit-mask-repeat: no-repeat;
      -webkit-mask-position: center;
      -webkit-mask-size: 100% 100%;
      background-color: #ccc;
      transition: background-color 0.2s;
    }
    .resizer:hover::after {
      background-color: #888;
    }
  `;
    shadowRoot.appendChild(style);

    // 3. UI Structure (Merged Header)
    const wrapper = document.createElement('div');
    wrapper.id = 'panel-container';
    wrapper.innerHTML = `
    <header>
      <div class="header-title">Outline</div>
      <div class="header-actions">
        <!-- Switch Action (moved to left) -->
        <button class="icon-btn" id="switch-dock-btn" title="切换到侧边栏">
           <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
              <path d="M14 2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h12zM2 3v10h9V3H2zm10 0v10h2V3h-2z"/>
           </svg>
        </button>

        <!-- Toolbar Actions -->
         <button class="icon-btn" id="collapse-all-btn" title="全部折叠">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z" />
          </svg>
        </button>
        <button class="icon-btn" id="expand-all-btn" title="全部展开">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" />
          </svg>
        </button>
         <button class="icon-btn" id="menu-btn" title="显示层级">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zm0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
          </svg>
        </button>
         <button class="icon-btn" id="refresh-btn" title="刷新">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
        
        <!-- Min/Close -->
        <button class="icon-btn" id="minimize-btn" title="最小化/关闭">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
        </button>
      </div>
      <!-- Dropdown attached to menu btn logic -->
      <div class="dropdown-menu" id="dropdown-menu" style="top:38px; right: 8px;"></div> 
    </header>
    
    <div id="toc-container">
      <div style="padding: 20px; color:#999; text-align:center; font-size:13px;">正在加载...</div>
    </div>
    <div class="resizer"></div>
  `;
    shadowRoot.appendChild(wrapper);
    document.body.appendChild(overlayContainer);

    // 4. Import logic
    try {
        const src = chrome.runtime.getURL('outline-renderer.js');
        const module = await import(src);
        const OutlineRenderer = module.OutlineRenderer;

        const container = wrapper.querySelector('#toc-container');
        const dropdownMenu = wrapper.querySelector('#dropdown-menu');

        renderer = new OutlineRenderer(container, {
            onJump: (index) => jumpTo(index),
            onHighlight: (index) => selectRange(index),
            onMenuAction: () => dropdownMenu.classList.remove('show')
        });

        // Bind Events
        wrapper.querySelector('#refresh-btn').onclick = refreshTOC;
        wrapper.querySelector('#collapse-all-btn').onclick = () => renderer.collapseAll();
        wrapper.querySelector('#expand-all-btn').onclick = () => renderer.expandAll();

        const menuBtn = wrapper.querySelector('#menu-btn');
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        };
        // Close menu when clicking outside (inside shadow dom)
        wrapper.onclick = (e) => {
            if (!menuBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('show');
            }
        };

        wrapper.querySelector('#minimize-btn').onclick = () => {
            hidePanel();
        };

        wrapper.querySelector('#switch-dock-btn').onclick = () => {
            hidePanel();
            chrome.runtime.sendMessage({ action: "OPEN_SIDEPANEL" });
        };

        // Drag Logic (Header as handle)
        const header = wrapper.querySelector('header');
        setupDrag(overlayContainer, header);

        // Resize Logic
        setupResize(overlayContainer, wrapper.querySelector('.resizer'));

    } catch (e) {
        console.error("Failed to load renderer", e);
    }
}

function getHeadings() {
    const tags = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    return Array.from(tags).map(t => ({
        tag: t.tagName,
        text: t.innerText.trim(),
        id: t.id,
        element: t // Keep ref for jumping
    })).filter(h => h.text.length > 0);
}

function refreshTOC() {
    if (!renderer) return;

    const rawHeadings = getHeadings();
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
    const dropdownMenu = shadowRoot.querySelector('#dropdown-menu');
    dropdownMenu.innerHTML = '';
    dropdownMenu.appendChild(renderer.createDropdownContent(currentHeadings));
}

function jumpTo(index) {
    const headings = getHeadings();
    if (headings[index] && headings[index].element) {
        headings[index].element.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
}

function selectRange(index) {
    const headings = getHeadings();
    const startNode = headings[index] ? headings[index].element : null;
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

// Drag & Resize Utils
function setupDrag(element, handle) {
    let isDragging = false;
    let startX, startY, initialRight, initialTop;

    handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;

        // Position Fix: Prefer computed style or inline style to avoid sub-pixel drift
        // from getBoundingClientRect mixed with clientWidth.
        const styleRight = element.style.right;
        const styleTop = element.style.top;

        if (styleRight && styleRight.endsWith('px')) {
            initialRight = parseFloat(styleRight);
        } else {
            const rect = element.getBoundingClientRect();
            initialRight = document.documentElement.clientWidth - rect.right;
        }

        if (styleTop && styleTop.endsWith('px')) {
            initialTop = parseFloat(styleTop);
        } else {
            const rect = element.getBoundingClientRect();
            initialTop = rect.top;
        }

        element.style.left = 'auto'; // Ensure left is auto
        element.style.right = initialRight + 'px';
        element.style.top = initialTop + 'px';

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // Update top and right (moving right decreases the 'right' value)
        element.style.right = `${initialRight - dx}px`;
        element.style.top = `${initialTop + dy}px`;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

function setupResize(element, handle) {
    let isResizing = false;
    let startX, startY, initialWidth, initialHeight, initialRight;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;

        const rect = element.getBoundingClientRect();
        initialWidth = rect.width;
        initialHeight = rect.height;

        // Fix: Use inline style for right to prevent drift
        const styleRight = element.style.right;
        if (styleRight && styleRight.endsWith('px')) {
            initialRight = parseFloat(styleRight);
        } else {
            initialRight = document.documentElement.clientWidth - rect.right;
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const newWidth = Math.max(200, initialWidth + dx);
        const newHeight = Math.max(150, initialHeight + dy);

        // Calculate expected change in width to adjust right position
        const widthChange = newWidth - initialWidth;

        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;

        // Adjust right so the expansion happens towards the right (mouse direction)
        // instead of towards the left (default behavior for right-anchored elements)
        element.style.right = `${initialRight - widthChange}px`;
        element.style.left = 'auto';
    }

    function onMouseUp() {
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

function setupContentObserver() {
    if (window.floatingObserverActive) return;
    window.floatingObserverActive = true;

    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    const debouncedRefresh = debounce(refreshTOC, 300);

    const observer = new MutationObserver((mutations) => {
        let shouldRefresh = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (let n of mutation.addedNodes) {
                    if (n.nodeType === 1 && (n.tagName.match(/^H[1-6]$/i) || n.querySelector('h1,h2,h3,h4,h5,h6'))) { shouldRefresh = true; break; }
                }
                if (!shouldRefresh) {
                    for (let n of mutation.removedNodes) {
                        if (n.nodeType === 1 && (n.tagName.match(/^H[1-6]$/i) || n.querySelector('h1,h2,h3,h4,h5,h6'))) { shouldRefresh = true; break; }
                    }
                }
            } else if (mutation.type === 'characterData') {
                if (mutation.target.parentNode && mutation.target.parentNode.tagName.match(/^H[1-6]$/i)) shouldRefresh = true;
            }
            if (shouldRefresh) break;
        }

        if (shouldRefresh) debouncedRefresh();
    });

    if (document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
