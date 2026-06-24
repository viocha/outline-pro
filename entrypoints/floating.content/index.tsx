import { createRoot } from 'react-dom/client';
import FloatingApp from './FloatingApp';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  cssInjectionMode: 'ui',

  async main(ctx) {
    registerAutoRefreshObserver();

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'SHOW_FLOATING_PANEL') {
        ensureUI(ctx, 'show');
      } else if (msg.action === 'HIDE_FLOATING_PANEL') {
        ensureUI(ctx, 'hide');
      } else if (msg.action === 'TOGGLE_FLOATING_PANEL') {
        ensureUI(ctx, 'toggle');
      } else if (msg.action === 'RESET_FLOATING_PANEL') {
        showCommand?.('reset');
      }
    });

    // Check if panel should be visible on load (restore state)
    chrome.runtime.sendMessage({ action: 'GET_FLOATING_STATE' }, (state) => {
      if (state?.isVisible) {
        ensureUI(ctx, 'show');
      }
    });
  },
});

let uiMountPromise: Promise<void> | null = null;
let showCommand: (
  (cmd: 'show' | 'hide' | 'toggle' | 'reset') => void
) | null = null;
let pendingCommand: 'show' | 'hide' | 'toggle' = 'show';

async function ensureUI(ctx: any, cmd: 'show' | 'hide' | 'toggle') {
  if (showCommand) {
    showCommand?.(cmd);
    return;
  }
  pendingCommand = cmd;
  if (uiMountPromise) return;

  uiMountPromise = (async () => {
    await waitForBody();

    const ui = await createShadowRootUi(ctx, {
      name: 'outline-floating-panel',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container) {
        const wrapper = document.createElement('div');
        container.append(wrapper);

        const root = createRoot(wrapper);
        root.render(
          <FloatingApp
            registerCommand={(fn) => {
              showCommand = fn;
            }}
            initialCommand={pendingCommand}
          />,
        );

        return { root, wrapper };
      },
      onRemove(mounted) {
        mounted?.root.unmount();
      },
    });

    ui.mount();
  })();

  await uiMountPromise;
}

function waitForBody(): Promise<void> {
  if (document.body) return Promise.resolve();

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.body) return;
      observer.disconnect();
      resolve();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

function registerAutoRefreshObserver() {
  if ((window as typeof window & { __outlineProObserverInstalled?: boolean }).__outlineProObserverInstalled) {
    return;
  }
  (window as typeof window & { __outlineProObserverInstalled?: boolean }).__outlineProObserverInstalled = true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const sendRefresh = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'AUTO_REFRESH' }).catch(() => {});
    }, 120);
  };

  const isHeadingNode = (node: Node) =>
    node.nodeType === 1 &&
    (/^H[1-6]$/i.test((node as Element).tagName) ||
      !!(node as Element).querySelector?.('h1,h2,h3,h4,h5,h6'));

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        if (
          mutation.target.parentNode &&
          /^H[1-6]$/i.test((mutation.target.parentNode as Element).tagName)
        ) {
          sendRefresh();
          return;
        }
      }

      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (isHeadingNode(node)) {
            sendRefresh();
            return;
          }
        }
        for (const node of mutation.removedNodes) {
          if (isHeadingNode(node)) {
            sendRefresh();
            return;
          }
        }
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendRefresh, { once: true });
  } else {
    sendRefresh();
  }
}
