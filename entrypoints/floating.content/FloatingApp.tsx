import { useState, useRef, useEffect, useCallback } from 'react';
import OutlineHeader from '@/components/OutlineHeader';
import OutlineTree, { type OutlineTreeRef } from '@/components/OutlineTree';
import { ScrollArea } from '@/components/ui/scroll-area';
import { normalizeHeadings, type HeadingItem, type FloatingState } from '@/lib/types';
import '@/assets/main.css';

interface FloatingAppProps {
  registerCommand: (fn: (cmd: 'show' | 'hide' | 'toggle') => void) => void;
  initialCommand: 'show' | 'hide' | 'toggle';
}

export default function FloatingApp({
  registerCommand,
  initialCommand,
}: FloatingAppProps) {
  const [visible, setVisible] = useState(false);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const treeRef = useRef<OutlineTreeRef>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const initialSmartCollapseDone = useRef(false);

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
    }
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
        showPanel().then(() => savePanelState(true));
      } else if (cmd === 'hide') {
        hidePanel();
      } else if (cmd === 'toggle') {
        setVisible((prev) => {
          const next = !prev;
          if (next) {
            showPanel().then(() => savePanelState(true));
          } else {
            savePanelState(false);
          }
          return next;
        });
      }
    });
  }, [registerCommand, showPanel, hidePanel, savePanelState]);

  // Process initial command
  useEffect(() => {
    if (initialCommand === 'show' || initialCommand === 'toggle') {
      showPanel().then(() => savePanelState(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh TOC
  const refreshTOC = useCallback(() => {
    setIsRefreshing(true);
    const tags = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const raw = Array.from(tags)
      .map((t) => ({
        tag: t.tagName,
        text: (t as HTMLElement).innerText.trim().replaceAll('\n', ' '),
        id: t.id,
      }))
      .filter((h) => h.text.length > 0);
    const normalized = normalizeHeadings(raw);
    setHeadings(normalized);
    initialSmartCollapseDone.current = false;
    setTimeout(() => setIsRefreshing(false), 500);
  }, []);

  // Smart collapse after headings change
  useEffect(() => {
    if (headings.length > 0 && !initialSmartCollapseDone.current && treeRef.current) {
      treeRef.current.smartCollapse(50);
      initialSmartCollapseDone.current = true;
    }
  }, [headings]);

  // Refresh on show
  useEffect(() => {
    if (visible) refreshTOC();
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

  // --- Resize BR logic ---
  const handleResizeBR = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialWidth = parseFloat(position.width);
      const initialHeight = parseFloat(position.height);
      const initialRight = parseFloat(position.right);

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newWidth = Math.max(200, initialWidth + dx);
        const newHeight = Math.max(150, initialHeight + dy);
        const widthChange = newWidth - initialWidth;
        setPosition((p) => ({
          ...p,
          width: `${newWidth}px`,
          height: `${newHeight}px`,
          right: `${initialRight - widthChange}px`,
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

  // --- Resize BL logic ---
  const handleResizeBL = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const initialWidth = parseFloat(position.width);
      const initialHeight = parseFloat(position.height);

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        setPosition((p) => ({
          ...p,
          width: `${Math.max(200, initialWidth - dx)}px`,
          height: `${Math.max(150, initialHeight + dy)}px`,
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
      }}
    >
      <div
        ref={panelRef}
        className="relative flex flex-col h-full bg-white shadow-lg border border-gray-300 rounded-lg overflow-hidden"
      >
        {/* Header with drag handle */}
        <div onMouseDown={handleDragStart}>
          <OutlineHeader
            mode="floating"
            headings={headings}
            isRefreshing={isRefreshing}
            portalContainer={portalContainer}
            onRefresh={refreshTOC}
            onCollapseAll={() => treeRef.current?.collapseAll()}
            onExpandAll={() => treeRef.current?.expandAll()}
            onExpandToLevel={(level) => treeRef.current?.expandToLevel(level)}
            onSmartCollapse={(threshold) =>
              treeRef.current?.smartCollapse(threshold)
            }
            onSwitchMode={switchToSidebar}
            onClose={hidePanel}
          />
        </div>

        <ScrollArea className="flex-1">
          <OutlineTree
            ref={treeRef}
            headings={headings}
            onJump={jumpTo}
            onHighlight={selectRange}
          />
        </ScrollArea>

        {/* Resize handles */}
        <div
          className="absolute bottom-0 right-0 size-6 cursor-se-resize z-20"
          onMouseDown={handleResizeBR}
        />
        <div
          className="absolute bottom-0 left-0 size-6 cursor-sw-resize z-20"
          onMouseDown={handleResizeBL}
        />

        {/* Portal container for dropdown menus - must stay inside Shadow DOM */}
        <div ref={setPortalContainer} className="absolute z-50" />
      </div>
    </div>
  );
}
