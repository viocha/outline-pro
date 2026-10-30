import '@fontsource-variable/geist';
import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import OutlineHeader from '@/components/OutlineHeader';
import OutlineTree, { type OutlineTreeRef } from '@/components/OutlineTree';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  normalizeHeadings,
  type HeadingItem,
  type FloatingState,
  type FloatingPanelPosition,
  type Settings,
  DEFAULT_FLOATING_POSITION,
  DEFAULT_SETTINGS,
  loadSettings,
  SETTINGS_KEY,
  headingsFingerprint,
  loadCollapseState,
  saveCollapseState,
  loadScrollState,
  saveScrollState,
} from '@/lib/types';
import '@/assets/main.css';

const ACTIVE_HEADING_VIEWPORT_RATIO = 0.2;
const ACTIVE_HEADING_TOLERANCE_PX = 12;

interface FloatingAppProps {
  registerCommand: (
    fn: (cmd: 'show' | 'hide' | 'toggle' | 'reset') => void,
  ) => void;
  initialCommand: 'show' | 'hide' | 'toggle';
}

type ResizeDirection =
  'left' | 'right' | 'bottom' | 'bottom-left' | 'bottom-right';

type HeadingsUpdateMode = 'reset' | 'restore' | 'preserve';

interface RefreshOptions {
  silent?: boolean;
  preserveView?: boolean;
}

function getOutlineHeadingElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      el.innerText.trim().replaceAll('\n', ' ').length > 0,
  );
}

export default function FloatingApp({
  registerCommand,
  initialCommand,
}: FloatingAppProps) {
  const [visible, setVisible] = useState(false);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshFrameRef = useRef<number | null>(null);
  const manualRefreshPendingRef = useRef(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [collapsedSet, setCollapsedSet] = useState<Set<number>>(new Set());
  const treeRef = useRef<OutlineTreeRef>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const headingsFpRef = useRef('');
  // Controls how the next headings update treats the user's tree viewport.
  const headingsUpdateModeRef = useRef<HeadingsUpdateMode>('reset');
  const preservedScrollTopRef = useRef<number | null>(null);
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
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'sync' && changes[SETTINGS_KEY]) {
        const newValue = changes[SETTINGS_KEY].newValue;
        if (newValue) setSettings({ ...DEFAULT_SETTINGS, ...newValue });
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Position state
  const [position, setPosition] = useState<FloatingPanelPosition>({
    ...DEFAULT_FLOATING_POSITION,
  });

  const savePanelState = useCallback(
    (isVisible: boolean, pos?: FloatingPanelPosition) => {
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
    const nextPosition = state
      ? {
          top: state.top || DEFAULT_FLOATING_POSITION.top,
          right: state.right || DEFAULT_FLOATING_POSITION.right,
          width: state.width || DEFAULT_FLOATING_POSITION.width,
          height: state.height || DEFAULT_FLOATING_POSITION.height,
        }
      : { ...DEFAULT_FLOATING_POSITION };

    setPosition(nextPosition);
    // Persist visibility immediately so refresh/same-tab navigation can
    // restore the floating panel even when the user never drags/resizes it.
    chrome.runtime.sendMessage({
      action: 'SAVE_FLOATING_STATE',
      state: {
        ...(state ?? {}),
        ...nextPosition,
        isVisible: true,
      },
    });
    setIsInitializing(true);
    setVisible(true);
  }, []);

  const hidePanel = useCallback(() => {
    setVisible(false);
    savePanelState(false);
  }, [savePanelState]);

  const resetPanel = useCallback(() => {
    const nextPosition = { ...DEFAULT_FLOATING_POSITION };
    setPosition(nextPosition);
    savePanelState(visibleRef.current, nextPosition);
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
      } else if (cmd === 'reset') {
        resetPanel();
      }
    });
  }, [registerCommand, showPanel, hidePanel, resetPanel]);

  // Process initial command
  useEffect(() => {
    if (initialCommand === 'show' || initialCommand === 'toggle') {
      showPanel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh TOC
  const refreshTOC = useCallback((opts: RefreshOptions = {}) => {
    const raw = getOutlineHeadingElements().map((t) => ({
      tag: t.tagName,
      text: t.innerText.trim().replaceAll('\n', ' '),
      id: t.id,
    }));
    const normalized = normalizeHeadings(raw);
    const fp = headingsFingerprint(normalized);
    const currentFp = headingsFpRef.current;

    // Mutation observers can report several DOM changes that resolve to the
    // same outline. Avoid replacing the headings array in that case.
    if (opts.preserveView && currentFp === fp) return;

    // Skip spinner if called silently and headings haven't changed
    const unchanged = !!opts.silent && currentFp === fp && currentFp !== '';

    if (opts.preserveView) {
      headingsUpdateModeRef.current = 'preserve';
      preservedScrollTopRef.current =
        scrollViewportRef.current?.scrollTop ?? null;
    } else {
      headingsUpdateModeRef.current = unchanged ? 'restore' : 'reset';
      preservedScrollTopRef.current = null;
    }

    setHeadings(normalized);
  }, []);

  const refreshManually = useCallback(() => {
    if (manualRefreshPendingRef.current) return;
    manualRefreshPendingRef.current = true;
    setIsRefreshing(true);

    // 先绘制旋转状态，再在下一帧读取页面；不设置动画最短时长。
    refreshFrameRef.current = requestAnimationFrame(() => {
      refreshFrameRef.current = requestAnimationFrame(() => {
        refreshFrameRef.current = null;
        try {
          refreshTOC();
        } catch (error) {
          console.error('刷新大纲失败', error);
        } finally {
          manualRefreshPendingRef.current = false;
          setIsRefreshing(false);
        }
      });
    });
  }, [refreshTOC]);

  useEffect(() => () => {
    if (refreshFrameRef.current !== null) cancelAnimationFrame(refreshFrameRef.current);
  }, []);

  // React keeps the viewport element mounted, but restoring its exact offset
  // before paint also covers updates that replace/reflow many outline rows.
  useLayoutEffect(() => {
    if (headingsUpdateModeRef.current !== 'preserve') return;
    const scrollTop = preservedScrollTopRef.current;
    preservedScrollTopRef.current = null;
    if (scrollTop !== null && scrollViewportRef.current) {
      scrollViewportRef.current.scrollTop = scrollTop;
    }
  }, [headings]);

  // Smart collapse / restore after headings change
  useEffect(() => {
    if (headings.length === 0) {
      headingsUpdateModeRef.current = 'reset';
      preservedScrollTopRef.current = null;
      setCollapsedSet(new Set());
      setPendingScrollTop(null);
      setIsInitializing(false);
      return;
    }
    const fp = headingsFingerprint(headings);
    headingsFpRef.current = fp;

    const updateMode = headingsUpdateModeRef.current;
    headingsUpdateModeRef.current = 'reset';

    if (updateMode === 'preserve') {
      // Live page mutations (for example an AI response being generated)
      // update the rows without changing scroll or collapse state.
      setPendingScrollTop(null);
      setIsInitializing(false);
    } else if (updateMode === 'restore') {
      // Panel reopened with unchanged headings → restore saved collapse + scroll
      Promise.all([loadCollapseState(), loadScrollState()])
        .then(([collapse, scroll]) => {
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
        })
        .catch(() => setIsInitializing(false));
    } else {
      // Manual refresh or a genuinely new page → reset to the default state.
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
    const debouncedRefresh = debounce(
      () => refreshTOC({ silent: true, preserveView: true }),
      300,
    );
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
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
    return () => observer.disconnect();
  }, [visible, refreshTOC]);

  // Jump to heading
  const jumpTo = useCallback(
    (index: number) => {
      if (settings.autoHighlightActive) {
        setActiveIndex(index);
      }
      const el = getOutlineHeadingElements()[index];
      if (!el) return;

      if (!settings.autoHighlightActive) {
        el.scrollIntoView({ behavior: 'instant', block: 'start' });
        return;
      }

      const threshold = window.innerHeight * ACTIVE_HEADING_VIEWPORT_RATIO;
      const desiredTop = Math.max(threshold - ACTIVE_HEADING_TOLERANCE_PX, 0);
      const targetTop =
        window.scrollY + el.getBoundingClientRect().top - desiredTop;
      const maxTop = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        0,
      );
      window.scrollTo({
        top: Math.min(Math.max(targetTop, 0), maxTop),
        behavior: 'instant',
      });
    },
    [settings.autoHighlightActive],
  );

  // Select/highlight heading text
  const selectRange = useCallback((index: number) => {
    const el = getOutlineHeadingElements()[index];
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

  useEffect(() => {
    if (!settings.autoHighlightActive || !visible) {
      setActiveIndex(-1);
      return;
    }

    const getActive = () => {
      const els = getOutlineHeadingElements();
      if (els.length === 0) return -1;
      const threshold =
        window.innerHeight * ACTIVE_HEADING_VIEWPORT_RATIO +
        ACTIVE_HEADING_TOLERANCE_PX;
      let active = 0;
      for (let i = 0; i < els.length; i++) {
        const rect = els[i]!.getBoundingClientRect();
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
        fontFamily: '"Geist Variable", "Segoe UI", sans-serif',
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
          settings={settings}
          isRefreshing={isRefreshing}
          portalContainer={portalContainer}
          onDragHandleMouseDown={handleDragStart}
          onRefresh={refreshManually}
          onCollapseAll={() => treeRef.current?.collapseAll()}
          onExpandAll={() => treeRef.current?.expandAll()}
          onExpandToLevel={(level) => treeRef.current?.expandToLevel(level)}
          onSmartCollapse={(threshold) =>
            treeRef.current?.smartCollapse(threshold)
          }
          onSwitchMode={switchToSidebar}
          onClose={hidePanel}
        />

        <ScrollArea className="min-h-0 flex-1" viewportRef={scrollViewportRef}>
          <OutlineTree
            ref={treeRef}
            headings={headings}
            portalContainer={portalContainer}
            collapsedSet={collapsedSet}
            onCollapsedSetChange={setCollapsedSet}
            activeIndex={settings.autoHighlightActive ? activeIndex : undefined}
            highlightOpacity={settings.highlightOpacity}
            fontSize={settings.fontSize}
            nonLeafBlankAreaJump={settings.nonLeafBlankAreaJump}
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
