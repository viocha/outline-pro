import {
  useCallback,
  useImperativeHandle,
  forwardRef,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TreeNode, HeadingItem } from '@/lib/types';
import { buildTree } from '@/lib/types';

const ACTIVE_ROW_HIGHLIGHT_CLASS_MAP = {
  10: 'bg-blue-100/10',
  20: 'bg-blue-100/20',
  30: 'bg-blue-100/30',
  40: 'bg-blue-100/40',
  50: 'bg-blue-100/50',
} as const;

function getActiveRowHighlightClass(opacity: number) {
  return ACTIVE_ROW_HIGHLIGHT_CLASS_MAP[
    opacity as keyof typeof ACTIVE_ROW_HIGHLIGHT_CLASS_MAP
  ] ?? ACTIVE_ROW_HIGHLIGHT_CLASS_MAP[30];
}

/** Return the indices of all ancestor (non-leaf) nodes of the node with targetIndex */
function findAncestors(nodes: TreeNode[], targetIndex: number): number[] {
  const result: number[] = [];
  const walk = (list: TreeNode[], path: number[]): boolean => {
    for (const n of list) {
      if (n.index === targetIndex) {
        result.push(...path);
        return true;
      }
      if (n.children.length > 0 && walk(n.children, [...path, n.index])) {
        return true;
      }
    }
    return false;
  };
  walk(nodes, []);
  return result;
}

export interface OutlineTreeRef {
  collapseAll: () => void;
  expandAll: () => void;
  expandToLevel: (level: number) => void;
  smartCollapse: (threshold: number) => void;
}

interface OutlineTreeProps {
  headings: HeadingItem[];
  collapsedSet: Set<number>;
  onCollapsedSetChange: (set: Set<number>) => void;
  activeIndex?: number;
  highlightOpacity?: number;
  nonLeafBlankAreaJump?: boolean;
  onJump: (index: number) => void;
  onHighlight: (index: number) => void;
}

interface ContextMenuState {
  index: number;
  x: number;
  y: number;
  highlightText: boolean;
}

const OutlineTree = forwardRef<OutlineTreeRef, OutlineTreeProps>(
  ({
    headings,
    collapsedSet,
    onCollapsedSetChange,
    activeIndex,
    highlightOpacity = 30,
    nonLeafBlankAreaJump = false,
    onJump,
    onHighlight,
  }, ref) => {
    const tree = useMemo(() => buildTree(headings), [headings]);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

    // Stable refs so the activeIndex effect never captures stale values
    const collapsedSetRef = useRef(collapsedSet);
    collapsedSetRef.current = collapsedSet;
    const onCollapsedSetChangeRef = useRef(onCollapsedSetChange);
    onCollapsedSetChangeRef.current = onCollapsedSetChange;

    // When the active heading is inside a collapsed subtree, expand all its ancestors
    useEffect(() => {
      if (activeIndex === undefined || activeIndex < 0) return;
      const ancestors = findAncestors(tree, activeIndex);
      const toExpand = ancestors.filter((i) => collapsedSetRef.current.has(i));
      if (toExpand.length === 0) return;
      const next = new Set(collapsedSetRef.current);
      toExpand.forEach((i) => next.delete(i));
      onCollapsedSetChangeRef.current(next);
    }, [activeIndex, tree]);

    // Scroll the active row into view; depends on collapsedSet so it re-fires
    // after auto-expand settles — preventing the case where the item is
    // scrolled while still inside a collapsed (invisible) subtree.
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (activeIndex === undefined || activeIndex < 0 || !containerRef.current) return;
      const activeEl = containerRef.current.querySelector('[data-active-row]') as HTMLElement | null;
      if (!activeEl) return;
      const raf = requestAnimationFrame(() => {
        // Skip when the element has no height — it's inside a collapsed div
        if (activeEl.getBoundingClientRect().height === 0) return;
        const findScrollParent = (el: HTMLElement | null): HTMLElement | null => {
          if (!el) return null;
          const { overflowY } = getComputedStyle(el);
          if ((overflowY === 'scroll' || overflowY === 'auto') && el.scrollHeight > el.clientHeight) return el;
          return findScrollParent(el.parentElement);
        };
        const scrollParent = findScrollParent(activeEl.parentElement);
        if (!scrollParent) return;
        const parentRect = scrollParent.getBoundingClientRect();
        const elRect = activeEl.getBoundingClientRect();
        const pad = 6;
        if (elRect.top < parentRect.top + pad) {
          scrollParent.scrollBy({ top: -(parentRect.top - elRect.top + pad), behavior: 'smooth' });
        } else if (elRect.bottom > parentRect.bottom - pad) {
          scrollParent.scrollBy({ top: elRect.bottom - parentRect.bottom + pad, behavior: 'smooth' });
        }
      });
      return () => cancelAnimationFrame(raf);
    }, [activeIndex, collapsedSet]);

    const toggleCollapse = useCallback((index: number) => {
      const next = new Set(collapsedSet);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      onCollapsedSetChange(next);
    }, [collapsedSet, onCollapsedSetChange]);

    const closeContextMenu = useCallback(() => {
      setContextMenu(null);
    }, []);

    const getSubtreeParentIndices = useCallback((targetIndex: number) => {
      let result: number[] = [];

      const walk = (nodes: TreeNode[]): boolean => {
        for (const node of nodes) {
          if (node.index === targetIndex) {
            const indices: number[] = [];
            const collect = (current: TreeNode) => {
              if (current.children.length > 0) {
                indices.push(current.index);
                current.children.forEach(collect);
              }
            };
            collect(node);
            result = indices;
            return true;
          }
          if (walk(node.children)) {
            return true;
          }
        }
        return false;
      };

      walk(tree);
      return result;
    }, [tree]);

    const collapseSubtree = useCallback((targetIndex: number) => {
      const indices = getSubtreeParentIndices(targetIndex);
      if (indices.length === 0) return;
      const next = new Set(collapsedSetRef.current);
      indices.forEach((index) => next.add(index));
      onCollapsedSetChangeRef.current(next);
    }, [getSubtreeParentIndices]);

    const expandSubtree = useCallback((targetIndex: number) => {
      const indices = getSubtreeParentIndices(targetIndex);
      if (indices.length === 0) return;
      const next = new Set(collapsedSetRef.current);
      indices.forEach((index) => next.delete(index));
      onCollapsedSetChangeRef.current(next);
    }, [getSubtreeParentIndices]);

    useEffect(() => {
      if (!contextMenu) return;

      const handleScroll = () => {
        setContextMenu(null);
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setContextMenu(null);
        }
      };

      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [contextMenu]);

    // Get all parent (non-leaf) node indices
    const getParentIndices = useCallback(
      (nodes: TreeNode[]): number[] => {
        const result: number[] = [];
        const walk = (list: TreeNode[]) => {
          for (const node of list) {
            if (node.children.length > 0) {
              result.push(node.index);
              walk(node.children);
            }
          }
        };
        walk(nodes);
        return result;
      },
      [],
    );

    const collapseAll = useCallback(() => {
      onCollapsedSetChange(new Set(getParentIndices(tree)));
    }, [tree, getParentIndices, onCollapsedSetChange]);

    const expandAll = useCallback(() => {
      onCollapsedSetChange(new Set());
    }, [onCollapsedSetChange]);

    const expandToLevel = useCallback(
      (targetLevel: number) => {
        const newCollapsed = new Set<number>();
        const walk = (nodes: TreeNode[]) => {
          for (const node of nodes) {
            if (node.children.length > 0) {
              if (node.heading.level >= targetLevel) {
                newCollapsed.add(node.index);
              }
              walk(node.children);
            }
          }
        };
        walk(tree);
        onCollapsedSetChange(newCollapsed);
      },
      [tree, onCollapsedSetChange],
    );

    const smartCollapse = useCallback(
      (threshold: number) => {
        const level1Nodes = tree.filter((n) => n.heading.level === 1);
        const isSingleLevel1 = level1Nodes.length === 1;
        const singleLevel1Index = isSingleLevel1
          ? level1Nodes[0].index
          : -1;

        const newCollapsed = new Set<number>();
        const walk = (nodes: TreeNode[]) => {
          for (const node of nodes) {
            if (node.children.length > 0) {
              if (
                node.index === singleLevel1Index
              ) {
                // Don't collapse the single top-level node
              } else if (node.children.length > threshold) {
                newCollapsed.add(node.index);
              }
              walk(node.children);
            }
          }
        };
        walk(tree);
        onCollapsedSetChange(newCollapsed);
      },
      [tree, onCollapsedSetChange],
    );

    useImperativeHandle(
      ref,
      () => ({ collapseAll, expandAll, expandToLevel, smartCollapse }),
      [collapseAll, expandAll, expandToLevel, smartCollapse],
    );

    // Auto smart-collapse on initial render
    // This is handled by the parent calling smartCollapse(50) after render

    if (headings.length === 0) {
      return (
        <p className="py-5 text-center text-[13px] text-text-dim">
          未发现标题
        </p>
      );
    }

    return (
      <div ref={containerRef} className="py-1.5">
        {tree.map((node) => (
          <TreeNodeItem
            key={node.index}
            node={node}
            depth={0}
            collapsedSet={collapsedSet}
            activeIndex={activeIndex}
            highlightOpacity={highlightOpacity}
            nonLeafBlankAreaJump={nonLeafBlankAreaJump}
            onToggle={toggleCollapse}
            onJump={onJump}
            onHighlight={onHighlight}
            contextMenuIndex={contextMenu?.index}
            contextMenuHighlightText={contextMenu?.highlightText}
            onOpenContextMenu={(index, x, y, highlightText) =>
              setContextMenu({ index, x, y, highlightText })}
          />
        ))}
        {contextMenu && (
          <>
            <div
              className="fixed inset-0 z-[99]"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeContextMenu();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                closeContextMenu();
              }}
            />
            <TreeNodeContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              hasChildren={getSubtreeParentIndices(contextMenu.index).length > 0}
              onJump={() => {
                onJump(contextMenu.index);
                closeContextMenu();
              }}
              onCollapseRecursive={() => {
                collapseSubtree(contextMenu.index);
                closeContextMenu();
              }}
              onExpandRecursive={() => {
                expandSubtree(contextMenu.index);
                closeContextMenu();
              }}
            />
          </>
        )}
      </div>
    );
  },
);
OutlineTree.displayName = 'OutlineTree';

interface TreeNodeItemProps {
  node: TreeNode;
  depth: number;
  collapsedSet: Set<number>;
  activeIndex?: number;
  highlightOpacity?: number;
  nonLeafBlankAreaJump?: boolean;
  onToggle: (index: number) => void;
  onJump: (index: number) => void;
  onHighlight: (index: number) => void;
  contextMenuIndex?: number;
  contextMenuHighlightText?: boolean;
  onOpenContextMenu: (
    index: number,
    x: number,
    y: number,
    highlightText: boolean,
  ) => void;
}

function TreeNodeItem({
  node,
  depth,
  collapsedSet,
  activeIndex,
  highlightOpacity = 30,
  nonLeafBlankAreaJump = false,
  onToggle,
  onJump,
  onHighlight,
  contextMenuIndex,
  contextMenuHighlightText,
  onOpenContextMenu,
}: TreeNodeItemProps) {
  const isLeaf = node.children.length === 0;
  const isCollapsed = collapsedSet.has(node.index);
  const isActive = activeIndex === node.index;
  const isContextMenuOpen = contextMenuIndex === node.index;
  const shouldKeepTextHighlight = isContextMenuOpen && contextMenuHighlightText;
  const level = node.heading.level;
  const textRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLDivElement>(null);

  const fontSizeClass =
    level <= 2
      ? 'text-[13px]'
      : level <= 4
        ? 'text-[12.5px]'
        : 'text-xs';

  const handleHeaderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLeaf) {
      onJump(node.index);
      return;
    }

    if (
      toggleRef.current &&
      e.target instanceof Node &&
      toggleRef.current.contains(e.target)
    ) {
      onToggle(node.index);
      return;
    }

    if (nonLeafBlankAreaJump) {
      onJump(node.index);
    } else {
      onToggle(node.index);
    }
  };

  const handleTextClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onJump(node.index);
  };

  const handleTextDblClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onHighlight(node.index);
  };

  const handleHeaderDblClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLeaf) {
      onHighlight(node.index);
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const highlightText =
      isLeaf ||
      (!!textRef.current &&
        e.target instanceof Node &&
        textRef.current.contains(e.target));
    onOpenContextMenu(node.index, e.clientX, e.clientY, highlightText);
  };

  return (
    <div className="flex flex-col">
      {/* Header row */}
      <div
        data-active-row={isActive ? 'true' : undefined}
        className={cn(
          'group flex items-center py-[2px] pr-1 cursor-pointer rounded select-none transition-colors duration-100',
          'min-w-full w-fit box-border',
          'hover:bg-bg-hover',
          isActive && !isContextMenuOpen && getActiveRowHighlightClass(highlightOpacity),
          isContextMenuOpen && 'bg-bg-hover',
        )}
        style={{ paddingLeft: depth * 18 }}
        onClick={handleHeaderClick}
        onDoubleClick={handleHeaderDblClick}
        onContextMenu={handleContextMenu}
      >
        {/* Toggle icon */}
        <div
          ref={toggleRef}
          className={cn(
            'mr-0.5 flex size-[1.2em] shrink-0 items-center justify-center rounded text-text-dim',
            'hover:bg-accent hover:text-muted-foreground',
            isLeaf && 'invisible pointer-events-none',
          )}
        >
          <ChevronDown
            className={cn(
              'size-2.5 transition-transform duration-200',
              isCollapsed && '-rotate-90',
            )}
          />
        </div>
        {/* Text */}
        <div
          className={cn(
            'whitespace-nowrap leading-[1.4] text-foreground/90 transition-colors duration-100',
            isLeaf || nonLeafBlankAreaJump
              ? 'group-hover:text-primary-strong'
              : 'hover:text-primary-strong',
            shouldKeepTextHighlight && 'text-primary',
            fontSizeClass,
          )}
          ref={textRef}
          title={node.heading.text}
          onClick={handleTextClick}
          onDoubleClick={handleTextDblClick}
        >
          {node.heading.text}
        </div>
      </div>

      {/* Children */}
      {!isLeaf && !isCollapsed && (
        <>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.index}
              node={child}
              depth={depth + 1}
              collapsedSet={collapsedSet}
              activeIndex={activeIndex}
              highlightOpacity={highlightOpacity}
              nonLeafBlankAreaJump={nonLeafBlankAreaJump}
              onToggle={onToggle}
              onJump={onJump}
              onHighlight={onHighlight}
              contextMenuIndex={contextMenuIndex}
              contextMenuHighlightText={contextMenuHighlightText}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
        </>
      )}
  </div>
);
}

interface TreeNodeContextMenuProps {
  x: number;
  y: number;
  hasChildren: boolean;
  onJump: () => void;
  onCollapseRecursive: () => void;
  onExpandRecursive: () => void;
}

function TreeNodeContextMenu({
  x,
  y,
  hasChildren,
  onJump,
  onCollapseRecursive,
  onExpandRecursive,
}: TreeNodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const { innerWidth, innerHeight } = window;
    const rect = menu.getBoundingClientRect();
    const nextLeft = Math.max(8, Math.min(x, innerWidth - rect.width - 8));
    const nextTop = Math.max(8, Math.min(y, innerHeight - rect.height - 8));
    setPosition({ left: nextLeft, top: nextTop });
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] w-max min-w-[112px] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: position.left, top: position.top }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
        onClick={onJump}
      >
        跳转到标题
      </button>
      {hasChildren && (
        <>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
            onClick={onCollapseRecursive}
          >
            递归折叠
          </button>
          <button
            type="button"
            className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
            onClick={onExpandRecursive}
          >
            递归展开
          </button>
        </>
      )}
    </div>
  );
}

export default OutlineTree;
