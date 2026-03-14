import { useState, useRef, useEffect, useCallback } from 'react';
import OutlineHeader from '@/components/OutlineHeader';
import OutlineTree, { type OutlineTreeRef } from '@/components/OutlineTree';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  normalizeHeadings,
  type HeadingItem,
  type FloatingState,
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
import '@/assets/main.css';

interface FloatingAppProps {
  registerCommand: (fn: (cmd: 'show' | 'hide' | 'toggle') => void) => void;
  initialCommand: 'show' | 'hide' | 'toggle';
}

type ResizeDirection =
  | 'left'
  | 'right'
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right';

export default function FloatingApp({
  registerCommand,
  initialCommand,
}: FloatingAppProps) {
  const [visible, setVisible] = useState(false);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [collapsedSet, setCollapsedSet] = useState<Set<number>>(new Set());
  const treeRef = useRef<OutlineTreeRef>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const headingsFpRef = useRef('');
  // Whether the NEXT headings effect should restore saved state.
  // Only true when panel is reopened with UNCHANGED headings (silent+same fp).
  // False for page refresh / mutation-triggered updates → always reset.
  const shouldRestoreRef = useRef(false);
  // Tracks visible without being stale in command-handler closures
  const visibleRef = useRef(false);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [pendingScrollTop, setPendingScrollTop] = useState<number | null>(null);
  // True while waiting for scroll restore — keeps the panel opacity:0 to avoid flicker
  const [isInitializing, setIsInitializing] = useState(false);

  // Keep visibleRef in sync
  visibleRef.current = visible;

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

  // Position state
  const [position, setPosition] = useState({
    top: '50px',
    right: '20px',
    width: '300px',
    height: '500px',
  });

  const savePanelState = useCallback(
    (isVisible: boolean, pos?: typeof position) => {
      const p = pos ?? position;
      const state: FloatingState = {
        isVisible,
        top: p.top,
        right: p.right,
        width: p.width,
        height: p.height,
      };
      chrome.runtime.sendMessage({ action: 'SAVE_FLOATING_STATE', state });
    },
    [position],
  );

  const showPanel = useCallback(async () => {
    // Restore saved state
    const state: FloatingState | null = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'GET_FLOATING_STATE' }, (s) =>
        resolve(s),
      );
    });
    if (state) {
      const newPos = {
        top: state.top || '50px',
        right: state.right || '20px',
        width: state.width || '300px',
        height: state.height || '500px',
      };
      setPosition(newPos);
      // Save isVisible=true using the loaded state object directly.
      // Do NOT call savePanelState() here — its position closure is stale
      // (React hasn't committed setPosition yet), which would overwrite the
      // correct saved position with the default values.
      chrome.runtime.sendMessage({
        action: 'SAVE_FLOATING_STATE',
        state: { ...state, isVisible: true },
      });
    }
    setIsInitializing(true);
    setVisible(true);
  }, []);

  const hidePanel = useCallback(() => {
    setVisible(false);
    savePanelState(false);
  }, [savePanelState]);

  // Register command handler
  useEffect(() => {
    registerCommand((cmd) => {
      if (cmd === 'show') {
        showPanel();
      } else if (cmd === 'hide') {
        hidePanel();
      } else if (cmd === 'toggle') {
        // Use visibleRef to avoid stale closure AND avoid calling async showPanel()
        // inside a setState callback (which would let setVisible(true) commit before
        // setIsInitializing(true), causing a one-frame flicker with opacity:1).
        if (visibleRef.current) {
          hidePanel();
        } else {
          showPanel();
        }
      }
    });
  }, [registerCommand, showPanel, hidePanel]);

  // Process initial command
  useEffect(() => {
    if (initialCommand === 'show' || initialCommand === 'toggle') {
      showPanel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh TOC
  const refreshTOC = useCallback((opts: { silent?: boolean } = {}) => {
    const tags = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const raw = Array.from(tags)
      .map((t) => ({
        tag: t.tagName,
        text: (t as HTMLElement).innerText.trim().replaceAll('\n', ' '),
        id: t.id,
      }))
      .filter((h) => h.text.length > 0);
    const normalized = normalizeHeadings(raw);
    const fp = headingsFingerprint(normalized);
    // Skip spinner if called silently and headings haven't changed
    const unchanged =
      !!opts.silent && headingsFpRef.current === fp && headingsFpRef.current !== '';
    // Mark that the next headings effect should RESTORE saved state (panel reopen,
    // same headings). For refresh / mutation updates this stays false → reset.
    shouldRestoreRef.current = unchanged;
    if (!unchanged) {
      setIsRefreshing(true);
      setTimeout(() => setIsRefreshing(false), 500);
    }
    setHeadings(normalized);
  }, []);

  // Smart collapse / restore after headings change
  useEffect(() => {
    if (headings.length === 0) {
      setCollapsedSet(new Set());
      setPendingScrollTop(null);
      setIsInitializing(false);
      return;
    }
    const fp = headingsFingerprint(headings);
    headingsFpRef.current = fp;

    const shouldRestore = shouldRestoreRef.current;
    shouldRestoreRef.current = false;

    if (shouldRestore) {
      // Panel reopened with unchanged headings → restore saved collapse + scroll
      Promise.all([loadCollapseState(), loadScrollState()]).then(([collapse, scroll]) => {
        if (collapse?.fingerprint === fp) {
          setCollapsedSet(new Set(collapse.collapsed));
          if (scroll?.fingerprint === fp) {
            // isInitializing stays true until scroll is applied in the rAF below
            setPendingScrollTop(scroll.scrollTop);
          } else {
            setIsInitializing(false);
          }
        } else {
          if (treeRef.current) treeRef.current.smartCollapse(50);
          setIsInitializing(false);
        }
      }).catch(() => setIsInitializing(false));
    } else {
      // Page refreshed or headings mutated → reset to default state, no restore
      setPendingScrollTop(null);
      const vp = scrollViewportRef.current;
      if (vp) vp.scrollTop = 0;
      if (treeRef.current) {
        treeRef.current.smartCollapse(50);
      } else {
        setCollapsedSet(new Set());
      }
      setIsInitializing(false);
    }
  }, [headings]);

  // Persist collapse state on every change
  useEffect(() => {
    const fp = headingsFpRef.current;
    if (!fp) return;
    saveCollapseState({ fingerprint: fp, collapsed: Array.from(collapsedSet) });
  }, [collapsedSet]);

  // Apply pending scroll restore via rAF so the DOM is fully laid out.
  // Always call setIsInitializing(false) even if the viewport ref isn't ready,
  // so the panel never gets stuck at opacity:0.
  useEffect(() => {
    if (pendingScrollTop === null) return;
    const vp = scrollViewportRef.current;
    const raf = requestAnimationFrame(() => {
      if (vp) vp.scrollTop = pendingScrollTop;
      setPendingScrollTop(null);
      setIsInitializing(false);
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

  // Refresh on show
  useEffect(() => {
    if (visible) refreshTOC({ silent: true });
  }, [visible, refreshTOC]);

  // Content observer
  useEffect(() => {
    if (!visible) return;
    const debounce = (fn: () => void, ms: number) => {
      let timer: ReturnType<typeof setTimeout>;
      return () => {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
      };
    };
    const debouncedRefresh = debounce(refreshTOC, 300);
    const observer = new MutationObserver((mutations) => {
      let shouldRefresh = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          for (const n of mutation.addedNodes) {
            if (
              n.nodeType === 1 &&
              (/^H[1-6]$/i.test((n as Element).tagName) ||
                (n as Element).querySelector?.('h1,h2,h3,h4,h5,h6'))
            ) {
              shouldRefresh = true;
              break;
            }
          }
          if (!shouldRefresh) {
            for (const n of mutation.removedNodes) {
              if (
                n.nodeType === 1 &&
                (/^H[1-6]$/i.test((n as Element).tagName) ||
                  (n as Element).querySelector?.('h1,h2,h3,h4,h5,h6'))
              ) {
                shouldRefresh = true;
                break;
              }
            }
          }
        } else if (mutation.type === 'characterData') {
          if (
            mutation.target.parentNode &&
            /^H[1-6]$/i.test((mutation.target.parentNode as Element).tagName)
          ) {
            shouldRefresh = true;
          }
        }
        if (shouldRefresh) break;
      }
      if (shouldRefresh) debouncedRefresh();
    });
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    return () => observer.disconnect();
  }, [visible, refreshTOC]);

  // Jump to heading
  const jumpTo = useCallback((index: number) => {
    const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const el = els[index] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, []);

  // Select/highlight heading text
  const selectRange = useCallback((index: number) => {
    const els = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const el = els[index] as HTMLElement | undefined;
    if (!el) return;
    const range = document.createRange();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    range.selectNodeContents(el);
    selection?.addRange(range);
    el.scrollIntoView({ behavior: 'instant', block: 'center' });
    setTimeout(() => selection?.removeAllRanges(), 500);
  }, []);

  const switchToSidebar = useCallback(() => {
    hidePanel();
    chrome.runtime.sendMessage({ action: 'OPEN_SIDEPANEL' });
  }, [hidePanel]);

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

  // Detect which heading is currently in view using scroll polling (floating runs in page context)
  useEffect(() => {
    if (!settings.autoHighlightActive || !visible) {
      setActiveIndex(-1);
      return;
    }

    const getActive = () => {
      const els = Array.from(
        document.querySelectorAll('h1, h2, h3, h4, h5, h6'),
      ) as HTMLElement[];
      if (els.length === 0) return -1;
      const threshold = window.innerHeight * 0.2;
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
    };

    const handleScroll = () => {
      setActiveIndex(getActive());
    };

    // Set initial value
    setActiveIndex(getActive());
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [settings.autoHighlightActive, visible, headings]);

  // --- Drag logic ---
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const initialRight = parseFloat(position.right);
      const initialTop = parseFloat(position.top);

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newPos = {
          ...position,
          right: `${initialRight - dx}px`,
          top: `${initialTop + dy}px`,
        };
        setPosition(newPos);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        // Save after drag
        setPosition((p) => {
          savePanelState(true, p);
          return p;
        });
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [position, savePanelState],
  );

  const startResize = useCallback(
    (e: React.MouseEvent, direction: ResizeDirection) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialWidth = parseFloat(position.width);
      const initialHeight = parseFloat(position.height);
      const initialRight = parseFloat(position.right);

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let nextWidth = initialWidth;
        let nextHeight = initialHeight;
        let nextRight = initialRight;

        if (direction === 'right' || direction === 'bottom-right') {
          nextWidth = Math.max(200, initialWidth + dx);
          nextRight = initialRight - (nextWidth - initialWidth);
        }

        if (direction === 'left' || direction === 'bottom-left') {
          nextWidth = Math.max(200, initialWidth - dx);
        }

        if (
          direction === 'bottom' ||
          direction === 'bottom-left' ||
          direction === 'bottom-right'
        ) {
          nextHeight = Math.max(150, initialHeight + dy);
        }

        setPosition((p) => ({
          ...p,
          width: `${nextWidth}px`,
          height: `${nextHeight}px`,
          right: `${nextRight}px`,
        }));
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        setPosition((p) => {
          savePanelState(true, p);
          return p;
        });
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [position, savePanelState],
  );

  const handleResizeRight = useCallback(
    (e: React.MouseEvent) => startResize(e, 'right'),
    [startResize],
  );

  const handleResizeLeft = useCallback(
    (e: React.MouseEvent) => startResize(e, 'left'),
    [startResize],
  );

  const handleResizeBottom = useCallback(
    (e: React.MouseEvent) => startResize(e, 'bottom'),
    [startResize],
  );

  const handleResizeBR = useCallback(
    (e: React.MouseEvent) => startResize(e, 'bottom-right'),
    [startResize],
  );

  const handleResizeBL = useCallback(
    (e: React.MouseEvent) => startResize(e, 'bottom-left'),
    [startResize],
  );

  if (!visible) return null;

  return (
    <div
      ref={hostRef}
      style={{
        position: 'fixed',
        top: position.top,
        right: position.right,
        width: position.width,
        height: position.height,
        zIndex: 2147483647,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '16px',
        opacity: isInitializing ? 0 : 1,
      }}
    >
      <div
        ref={panelRef}
        className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xl shadow-black/10 animate-in fade-in-0 zoom-in-95 duration-150"
      >
        <OutlineHeader
          mode="floating"
          headings={headings}
          isRefreshing={isRefreshing}
          autoHighlightActive={settings.autoHighlightActive}
          highlightOpacity={settings.highlightOpacity}
          portalContainer={portalContainer}
          onDragHandleMouseDown={handleDragStart}
          onRefresh={refreshTOC}
          onCollapseAll={() => treeRef.current?.collapseAll()}
          onExpandAll={() => treeRef.current?.expandAll()}
          onExpandToLevel={(level) => treeRef.current?.expandToLevel(level)}
          onSmartCollapse={(threshold) =>
            treeRef.current?.smartCollapse(threshold)
          }
          onSwitchMode={switchToSidebar}
          onToggleAutoHighlight={toggleAutoHighlight}
          onChangeHighlightOpacity={changeHighlightOpacity}
          onClose={hidePanel}
        />

        <ScrollArea className="flex-1" viewportRef={scrollViewportRef}>
          <OutlineTree
            ref={treeRef}
            headings={headings}
            collapsedSet={collapsedSet}
            onCollapsedSetChange={setCollapsedSet}
            activeIndex={settings.autoHighlightActive ? activeIndex : undefined}
            highlightOpacity={settings.highlightOpacity}
            onJump={jumpTo}
            onHighlight={selectRange}
          />
        </ScrollArea>

        {/* Portal container for dropdown menus - must stay inside Shadow DOM */}
        <div ref={setPortalContainer} className="absolute z-50" />
      </div>

      {/* Resize handles stay on the outside edge so they don't steal inner clicks */}
      <div
        className="absolute top-3 bottom-3 -left-1 w-2 cursor-w-resize z-20"
        onMouseDown={handleResizeLeft}
      />
      <div
        className="absolute top-3 bottom-3 -right-1 w-2 cursor-e-resize z-20"
        onMouseDown={handleResizeRight}
      />
      <div
        className="absolute -bottom-1 left-3 right-3 h-2 cursor-s-resize z-20"
        onMouseDown={handleResizeBottom}
      />
      <div
        className="absolute -bottom-1 -right-1 z-30 cursor-se-resize"
        onMouseDown={handleResizeBR}
        style={{ width: '12px', height: '12px' }}
      />
      <div
        className="absolute -bottom-1 -left-1 z-30 cursor-sw-resize"
        onMouseDown={handleResizeBL}
        style={{ width: '12px', height: '12px' }}
      />
    </div>
  );
}
