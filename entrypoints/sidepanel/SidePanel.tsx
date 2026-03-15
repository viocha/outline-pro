import { useState, useRef, useEffect, useCallback } from 'react';
import OutlineHeader from '@/components/OutlineHeader';
import OutlineTree, { type OutlineTreeRef } from '@/components/OutlineTree';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  normalizeHeadings,
  type HeadingItem,
  type Settings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  SETTINGS_KEY,
  headingsFingerprint,
  loadCollapseState,
  saveCollapseState,
  loadScrollState,
  saveScrollState,
} from '@/lib/types';

const ACTIVE_HEADING_VIEWPORT_RATIO = 0.2;
const ACTIVE_HEADING_TOLERANCE_PX = 12;

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
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [collapsedSet, setCollapsedSet] = useState<Set<number>>(new Set());
  const treeRef = useRef<OutlineTreeRef>(null);
  const currentTabIdRef = useRef<number | null>(null);
  const headingsFpRef = useRef('');
  // Only true when the next headings effect should restore saved state
  // (initial silent load with unchanged headings). Non-silent calls (tab update,
  // mutation, manual refresh) keep this false so state is always reset.
  const shouldRestoreRef = useRef(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [pendingScrollTop, setPendingScrollTop] = useState<number | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  // Sync settings changes from other panels
  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'sync' && changes[SETTINGS_KEY]) {
        const newValue = changes[SETTINGS_KEY].newValue;
        if (newValue) setSettings({ ...DEFAULT_SETTINGS, ...newValue });
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const refreshTOC = useCallback(async (opts: { silent?: boolean } = {}) => {
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
    setError(null);

    let willSpin = false;
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
        if (!opts.silent) {
          willSpin = true;
        } else {
          const saved = await loadCollapseState();
          willSpin = saved?.fingerprint !== headingsFingerprint(normalized);
        }
        // Restore saved state only on silent+unchanged open; reset on any real refresh
        shouldRestoreRef.current = !willSpin;
        if (willSpin) setIsRefreshing(true);
        setHeadings(normalized);
      } else {
        setHeadings([]);
        setError('未发现标题大纲');
      }
    } catch (err) {
      console.error('刷新失败:', err);
      setError('无法读取页面');
      setHeadings([]);
    } finally {
      if (willSpin) setTimeout(() => setIsRefreshing(false), 500);
    }
  }, []);

  // Restore or reset when headings change
  useEffect(() => {
    if (headings.length === 0) {
      setCollapsedSet(new Set());
      setPendingScrollTop(null);
      return;
    }
    const fp = headingsFingerprint(headings);
    headingsFpRef.current = fp;

    const shouldRestore = shouldRestoreRef.current;
    shouldRestoreRef.current = false;

    if (shouldRestore) {
      // Panel opened with unchanged headings → restore saved collapse + scroll
      Promise.all([loadCollapseState(), loadScrollState()]).then(([collapse, scroll]) => {
        if (collapse?.fingerprint === fp) {
          setCollapsedSet(new Set(collapse.collapsed));
          if (scroll?.fingerprint === fp) setPendingScrollTop(scroll.scrollTop);
        } else if (treeRef.current) {
          treeRef.current.smartCollapse(50);
        }
      });
    } else {
      // Tab navigated / refreshed / heading mutation → reset to default
      setPendingScrollTop(null);
      const vp = scrollViewportRef.current;
      if (vp) vp.scrollTop = 0;
      if (treeRef.current) {
        treeRef.current.smartCollapse(50);
      } else {
        setCollapsedSet(new Set());
      }
    }
  }, [headings]);

  // Persist collapse state on every change
  useEffect(() => {
    const fp = headingsFpRef.current;
    if (!fp) return;
    saveCollapseState({ fingerprint: fp, collapsed: Array.from(collapsedSet) });
  }, [collapsedSet]);

  // Apply pending scroll restore via rAF so the DOM is fully laid out
  useEffect(() => {
    if (pendingScrollTop === null) return;
    const vp = scrollViewportRef.current;
    if (!vp) return;
    const raf = requestAnimationFrame(() => {
      vp.scrollTop = pendingScrollTop;
      setPendingScrollTop(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [pendingScrollTop]);

  // Persist scroll position (debounced)
  useEffect(() => {
    const vp = scrollViewportRef.current;
    if (!vp) return;
    let timer: ReturnType<typeof setTimeout>;
    const handler = () => {
      const fp = headingsFpRef.current;
      const scrollTop = vp.scrollTop;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (fp) saveScrollState({ fingerprint: fp, scrollTop });
      }, 300);
    };
    vp.addEventListener('scroll', handler, { passive: true });
    return () => {
      clearTimeout(timer);
      vp.removeEventListener('scroll', handler);
    };
  }, [headings]);

  const jumpTo = useCallback((index: number) => {
    if (currentTabIdRef.current === null) return;
    if (settings.autoHighlightActive) {
      setActiveIndex(index);
    }
    chrome.scripting.executeScript({
      target: { tabId: currentTabIdRef.current },
      args: [
        index,
        settings.autoHighlightActive,
        ACTIVE_HEADING_VIEWPORT_RATIO,
        ACTIVE_HEADING_TOLERANCE_PX,
      ],
      func: (
        idx: number,
        alignToHighlight: boolean,
        viewportRatio: number,
        tolerancePx: number,
      ) => {
        const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const el = els[idx] as HTMLElement | undefined;
        if (!el) return;

        if (!alignToHighlight) {
          el.scrollIntoView({ behavior: 'instant', block: 'start' });
          return;
        }

        const threshold = window.innerHeight * viewportRatio;
        const desiredTop = Math.max(threshold - tolerancePx, 0);
        const targetTop = window.scrollY + el.getBoundingClientRect().top - desiredTop;
        const maxTop = Math.max(
          document.documentElement.scrollHeight - window.innerHeight,
          0,
        );
        window.scrollTo({
          top: Math.min(Math.max(targetTop, 0), maxTop),
          behavior: 'instant',
        });
      },
    });
  }, [settings.autoHighlightActive]);

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

  const toggleAutoHighlight = useCallback(() => {
    setSettings((prev) => {
      const next = { ...prev, autoHighlightActive: !prev.autoHighlightActive };
      saveSettings(next);
      if (!next.autoHighlightActive) setActiveIndex(-1);
      return next;
    });
  }, []);

  const changeHighlightOpacity = useCallback((v: number) => {
    setSettings((prev) => {
      const next = { ...prev, highlightOpacity: v as Settings['highlightOpacity'] };
      saveSettings(next);
      return next;
    });
  }, []);

  const toggleNonLeafBlankAreaJump = useCallback(() => {
    setSettings((prev) => {
      const next = {
        ...prev,
        nonLeafBlankAreaJump: !prev.nonLeafBlankAreaJump,
      };
      saveSettings(next);
      return next;
    });
  }, []);

  // Detect which heading is currently in view (sidepanel runs in extension context)
  useEffect(() => {
    if (!settings.autoHighlightActive || currentTabIdRef.current === null) {
      setActiveIndex(-1);
      return;
    }

    let rafId: ReturnType<typeof setTimeout>;
    const pollActive = () => {
      if (currentTabIdRef.current === null) return;
      chrome.scripting
        .executeScript({
          target: { tabId: currentTabIdRef.current },
          args: [ACTIVE_HEADING_VIEWPORT_RATIO, ACTIVE_HEADING_TOLERANCE_PX],
          func: (viewportRatio: number, tolerancePx: number) => {
            const els = Array.from(
              document.querySelectorAll('h1, h2, h3, h4, h5, h6'),
            ) as HTMLElement[];
            if (els.length === 0) return -1;
            // Find the last heading whose top is at or above 20% of viewport
            const threshold =
              window.innerHeight * viewportRatio + tolerancePx;
            let active = 0;
            for (let i = 0; i < els.length; i++) {
              const rect = els[i].getBoundingClientRect();
              if (rect.top <= threshold) {
                active = i;
              } else {
                break;
              }
            }
            return active;
          },
        })
        .then((results: { result: unknown }[]) => {
          const idx = results?.[0]?.result;
          if (typeof idx === 'number' && idx >= 0) {
            setActiveIndex(idx);
          }
        })
        .catch(() => {});
      rafId = setTimeout(pollActive, 300);
    };

    pollActive();
    return () => clearTimeout(rafId);
  }, [settings.autoHighlightActive, headings]);

  // Initial load and event listeners
  useEffect(() => {
    refreshTOC({ silent: true });

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
    <div className="m-0 flex h-screen flex-col overscroll-none bg-background font-sans text-foreground">
      <OutlineHeader
        mode="sidepanel"
        headings={headings}
        isRefreshing={isRefreshing}
        autoHighlightActive={settings.autoHighlightActive}
        highlightOpacity={settings.highlightOpacity}
        nonLeafBlankAreaJump={settings.nonLeafBlankAreaJump}
        onRefresh={refreshTOC}
        onCollapseAll={() => treeRef.current?.collapseAll()}
        onExpandAll={() => treeRef.current?.expandAll()}
        onExpandToLevel={(level) => treeRef.current?.expandToLevel(level)}
        onSmartCollapse={(threshold) => treeRef.current?.smartCollapse(threshold)}
        onSwitchMode={switchToFloating}
        onToggleAutoHighlight={toggleAutoHighlight}
        onChangeHighlightOpacity={changeHighlightOpacity}
        onToggleNonLeafBlankAreaJump={toggleNonLeafBlankAreaJump}
      />
      <ScrollArea className="flex-1" viewportRef={scrollViewportRef}>
        {error ? (
          <p className="py-4 text-center text-[13px] text-text-dim">{error}</p>
        ) : (
          <OutlineTree
            ref={treeRef}
            headings={headings}
            collapsedSet={collapsedSet}
            onCollapsedSetChange={setCollapsedSet}
            activeIndex={settings.autoHighlightActive ? activeIndex : undefined}
            highlightOpacity={settings.highlightOpacity}
            nonLeafBlankAreaJump={settings.nonLeafBlankAreaJump}
            onJump={jumpTo}
            onHighlight={selectRange}
          />
        )}
      </ScrollArea>
    </div>
  );
}
