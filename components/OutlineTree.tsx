import { useCallback, useImperativeHandle, forwardRef, useRef, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TreeNode, HeadingItem } from '@/lib/types';
import { buildTree } from '@/lib/types';

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
  onJump: (index: number) => void;
  onHighlight: (index: number) => void;
}

const OutlineTree = forwardRef<OutlineTreeRef, OutlineTreeProps>(
  ({ headings, collapsedSet, onCollapsedSetChange, activeIndex, highlightOpacity = 30, onJump, onHighlight }, ref) => {
    const tree = useMemo(() => buildTree(headings), [headings]);

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
            collapsedSet={collapsedSet}
            activeIndex={activeIndex}
            highlightOpacity={highlightOpacity}
            onToggle={toggleCollapse}
            onJump={onJump}
            onHighlight={onHighlight}
          />
        ))}
      </div>
    );
  },
);
OutlineTree.displayName = 'OutlineTree';

interface TreeNodeItemProps {
  node: TreeNode;
  collapsedSet: Set<number>;
  activeIndex?: number;
  highlightOpacity?: number;
  onToggle: (index: number) => void;
  onJump: (index: number) => void;
  onHighlight: (index: number) => void;
}

function TreeNodeItem({
  node,
  collapsedSet,
  activeIndex,
  highlightOpacity = 30,
  onToggle,
  onJump,
  onHighlight,
}: TreeNodeItemProps) {
  const isLeaf = node.children.length === 0;
  const isCollapsed = collapsedSet.has(node.index);
  const isActive = activeIndex === node.index;
  const level = node.heading.level;

  const fontSizeClass =
    level <= 2
      ? 'text-[13px]'
      : level <= 4
        ? 'text-[12.5px]'
        : 'text-xs';

  const handleHeaderClick = () => {
    if (isLeaf) {
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

  return (
    <div className="flex flex-col">
      {/* Header row */}
      <div
        data-active-row={isActive ? 'true' : undefined}
        className={cn(
          'group flex items-center py-[2px] pr-1 cursor-pointer rounded select-none transition-colors duration-100',
          'min-w-full w-fit box-border',
          'hover:bg-bg-hover',
        )}
        style={{
          paddingLeft: 0,
          ...(isActive ? { backgroundColor: `rgb(209 250 229 / ${highlightOpacity}%)` } : {}),
        }}
        onClick={handleHeaderClick}
        onDoubleClick={handleHeaderDblClick}
      >
        {/* Toggle icon */}
        <div
          className={cn(
            'size-[1.2em] shrink-0 flex items-center justify-center text-text-dim rounded mr-0.5',
            'hover:bg-black/5 hover:text-text-muted',
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
            'whitespace-nowrap transition-colors duration-100 leading-[1.4] text-[#444]',
            isLeaf ? 'group-hover:text-primary' : 'hover:text-primary',
            fontSizeClass,
          )}
          title={node.heading.text}
          onClick={handleTextClick}
          onDoubleClick={handleTextDblClick}
        >
          {node.heading.text}
        </div>
      </div>

      {/* Children */}
      {!isLeaf && (
        <div
          className={cn('pl-[18px]', isCollapsed && 'hidden')}
        >
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.index}
              node={child}
              collapsedSet={collapsedSet}
              activeIndex={activeIndex}
              highlightOpacity={highlightOpacity}
              onToggle={onToggle}
              onJump={onJump}
              onHighlight={onHighlight}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default OutlineTree;
