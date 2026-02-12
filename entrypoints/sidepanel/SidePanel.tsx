import { useState, useRef, useEffect, useCallback } from 'react';
import OutlineHeader from '@/components/OutlineHeader';
import OutlineTree, { type OutlineTreeRef } from '@/components/OutlineTree';
import { ScrollArea } from '@/components/ui/scroll-area';
import { normalizeHeadings, type HeadingItem } from '@/lib/types';

function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export default function SidePanel() {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const treeRef = useRef<OutlineTreeRef>(null);
  const currentTabIdRef = useRef<number | null>(null);
  const initialSmartCollapseDone = useRef(false);

  const refreshTOC = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (
      !tab?.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('edge://')
    ) {
      setError('当前页面不支持');
      setHeadings([]);
      return;
    }
    currentTabIdRef.current = tab.id!;
    setIsRefreshing(true);
    setError(null);

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: () => {
          const tags = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
          return Array.from(tags)
            .map((t) => ({
              tag: t.tagName,
              text: (t as HTMLElement).innerText.trim().replaceAll('\n', ' '),
              id: t.id,
            }))
            .filter((h) => h.text.length > 0);
        },
      });

      if (results?.[0]?.result) {
        const normalized = normalizeHeadings(results[0].result);
        setHeadings(normalized);
        initialSmartCollapseDone.current = false;
      } else {
        setHeadings([]);
        setError('未发现标题大纲');
      }

      // Setup content observer in the target page
      chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: setupContentObserver,
      });
    } catch (err) {
      console.error('刷新失败:', err);
      setError('无法读取页面');
      setHeadings([]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  }, []);

  // After headings update, apply smart collapse
  useEffect(() => {
    if (headings.length > 0 && !initialSmartCollapseDone.current && treeRef.current) {
      treeRef.current.smartCollapse(50);
      initialSmartCollapseDone.current = true;
    }
  }, [headings]);

  const jumpTo = useCallback((index: number) => {
    if (currentTabIdRef.current === null) return;
    chrome.scripting.executeScript({
      target: { tabId: currentTabIdRef.current },
      args: [index],
      func: (idx: number) => {
        const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (els[idx])
          els[idx].scrollIntoView({ behavior: 'instant', block: 'start' });
      },
    });
  }, []);

  const selectRange = useCallback((index: number) => {
    if (currentTabIdRef.current === null) return;
    chrome.scripting.executeScript({
      target: { tabId: currentTabIdRef.current },
      args: [index],
      func: (idx: number) => {
        const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const startNode = els[idx];
        if (!startNode) return;
        const range = document.createRange();
        const selection = window.getSelection();
        selection?.removeAllRanges();
        range.selectNodeContents(startNode);
        selection?.addRange(range);
        startNode.scrollIntoView({ behavior: 'instant', block: 'center' });
        setTimeout(() => selection?.removeAllRanges(), 500);
      },
    });
  }, []);

  const switchToFloating = useCallback(async () => {
    try {
      await chrome.runtime.sendMessage({
        action: 'SWITCH_TO_FLOATING',
        tabId: currentTabIdRef.current,
      });
      window.close();
    } catch (e) {
      console.error('Switch failed', e);
    }
  }, []);

  // Initial load and event listeners
  useEffect(() => {
    refreshTOC();

    const debouncedRefresh = debounce(refreshTOC, 300);

    const messageListener = (msg: { action: string }) => {
      if (msg.action === 'AUTO_REFRESH') debouncedRefresh();
      if (msg.action === 'CLOSE_SIDEPANEL') window.close();
    };

    const tabUpdatedListener = (
      tabId: number,
      info: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      if (!tab.active) return;

      if (info.url) {
        // URL changed: inject a DOMContentLoaded-time notifier.
        // executeScript without injectImmediately runs at document_idle
        // (after DOMContentLoaded, before load), so the outline updates
        // as soon as text is rendered, without waiting for images/styles.
        chrome.scripting
          .executeScript({
            target: { tabId },
            func: () => {
              chrome.runtime.sendMessage({ action: 'AUTO_REFRESH' }).catch(() => {});
            },
          })
          .catch(() => {});
      }

      // Keep 'complete' as fallback for pages that add headings late
      if (info.status === 'complete') {
        debouncedRefresh();
      }
    };

    const tabActivatedListener = () => debouncedRefresh();

    chrome.runtime.onMessage.addListener(messageListener);
    chrome.tabs.onUpdated.addListener(tabUpdatedListener);
    chrome.tabs.onActivated.addListener(tabActivatedListener);
    chrome.runtime.sendMessage({ action: 'SIDEPANEL_OPENED' }).catch(() => {});

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
      chrome.tabs.onUpdated.removeListener(tabUpdatedListener);
      chrome.tabs.onActivated.removeListener(tabActivatedListener);
    };
  }, [refreshTOC]);

  return (
    <div className="flex flex-col h-screen bg-white font-sans m-0 overscroll-none">
      <OutlineHeader
        mode="sidepanel"
        headings={headings}
        isRefreshing={isRefreshing}
        onRefresh={refreshTOC}
        onCollapseAll={() => treeRef.current?.collapseAll()}
        onExpandAll={() => treeRef.current?.expandAll()}
        onExpandToLevel={(level) => treeRef.current?.expandToLevel(level)}
        onSmartCollapse={(threshold) => treeRef.current?.smartCollapse(threshold)}
        onSwitchMode={switchToFloating}
      />
      <ScrollArea className="flex-1">
        {error ? (
          <p className="py-4 text-center text-[13px] text-text-dim">{error}</p>
        ) : (
          <OutlineTree
            ref={treeRef}
            headings={headings}
            onJump={jumpTo}
            onHighlight={selectRange}
          />
        )}
      </ScrollArea>
    </div>
  );
}

// Injected into the page to detect heading changes
function setupContentObserver() {
  if ((window as any).hasOutlineObserver) return;
  (window as any).hasOutlineObserver = true;

  function debounce(func: () => void, wait: number) {
    let timeout: ReturnType<typeof setTimeout>;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(func, wait);
    };
  }

  const sendUpdate = debounce(() => {
    chrome.runtime.sendMessage({ action: 'AUTO_REFRESH' });
  }, 300);

  const observer = new MutationObserver((mutations) => {
    let shouldRefresh = false;
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        if (
          mutation.target.parentNode &&
          /^H[1-6]$/i.test((mutation.target.parentNode as Element).tagName)
        ) {
          shouldRefresh = true;
          break;
        }
      } else if (mutation.type === 'childList') {
        const checkNode = (n: Node) =>
          n.nodeType === 1 &&
          (/^H[1-6]$/i.test((n as Element).tagName) ||
            (n as Element).querySelector('h1,h2,h3,h4,h5,h6'));
        for (const node of mutation.addedNodes) {
          if (checkNode(node)) {
            shouldRefresh = true;
            break;
          }
        }
        if (!shouldRefresh) {
          for (const node of mutation.removedNodes) {
            if (checkNode(node)) {
              shouldRefresh = true;
              break;
            }
          }
        }
      }
      if (shouldRefresh) break;
    }
    if (shouldRefresh) sendUpdate();
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
}
