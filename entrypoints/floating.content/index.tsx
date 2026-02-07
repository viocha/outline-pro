import { createRoot } from 'react-dom/client';
import FloatingApp from './FloatingApp';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'SHOW_FLOATING_PANEL') {
        ensureUI(ctx, 'show');
      } else if (msg.action === 'HIDE_FLOATING_PANEL') {
        ensureUI(ctx, 'hide');
      } else if (msg.action === 'TOGGLE_FLOATING_PANEL') {
        ensureUI(ctx, 'toggle');
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

let uiMounted = false;
let showCommand: ((cmd: 'show' | 'hide' | 'toggle') => void) | null = null;

async function ensureUI(ctx: any, cmd: 'show' | 'hide' | 'toggle') {
  if (uiMounted) {
    showCommand?.(cmd);
    return;
  }
  uiMounted = true;

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
          initialCommand={cmd}
        />,
      );

      return { root, wrapper };
    },
    onRemove(mounted) {
      mounted?.root.unmount();
    },
  });

  ui.mount();
}
