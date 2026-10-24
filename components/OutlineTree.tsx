import {
  useCallback,
  useImperativeHandle,
  forwardRef,
  useRef,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
} from '@/components/ui/context-menu';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TreeNode, HeadingItem } from '@/lib/types';
import { buildTree } from '@/lib/types';

const ACTIVE_ROW_HIGHLIGHT_CLASS_MAP = {
  10: 'bg-primary/2',
  20: 'bg-primary/4',
  30: 'bg-primary/6',
  40: 'bg-primary/8',
  50: 'bg-primary/10',
} as const;

function getActiveRowHighlightClass(opacity: number) {
  return (
    ACTIVE_ROW_HIGHLIGHT_CLASS_MAP[
      opacity as keyof typeof ACTIVE_ROW_HIGHLIGHT_CLASS_MAP
    ] ?? ACTIVE_ROW_HIGHLIGHT_CLASS_MAP[30]
  );
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
  fontSize?: number;
  portalContainer?: HTMLElement | null;
  headings: HeadingItem[];
  collapsedSet: Set<number>;
  onCollapsedSetChange: (set: Set<number>) => void;
  activeIndex?: number;
  highlightOpacity?: number;
  nonLeafBlankAreaJump?: boolean;
  onJump: (index: number) => void;
  onHighlight: (index: number) => void;
}

const OutlineTree = forwardRef<OutlineTreeRef, OutlineTreeProps>(
  (
    {
      headings,
      fontSize = 13,
      portalContainer,
      collapsedSet,
      onCollapsedSetChange,
      activeIndex,
      highlightOpacity = 30,
      nonLeafBlankAreaJump = false,
      onJump,
      onHighlight,
    },
    ref,
  ) => {
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
      if (activeIndex === undefined || activeIndex < 0 || !containerRef.current)
        return;
      const activeEl = containerRef.current.querySelector(
        '[data-active-row]',
      ) as HTMLElement | null;
      if (!activeEl) return;
      const raf = requestAnimationFrame(() => {
        // Skip when the element has no height — it's inside a collapsed div
        if (activeEl.getBoundingClientRect().height === 0) return;
        const findScrollParent = (
          el: HTMLElement | null,
        ): HTMLElement | null => {
          if (!el) return null;
          const { overflowY } = getComputedStyle(el);
          if (
            (overflowY === 'scroll' || overflowY === 'auto') &&
            el.scrollHeight > el.clientHeight
          )
            return el;
          return findScrollParent(el.parentElement);
        };
        const scrollParent = findScrollParent(activeEl.parentElement);
        if (!scrollParent) return;
        const parentRect = scrollParent.getBoundingClientRect();
        const elRect = activeEl.getBoundingClientRect();
        const pad = 6;
        if (elRect.top < parentRect.top + pad) {
          scrollParent.scrollBy({
            top: -(parentRect.top - elRect.top + pad),
            behavior: 'smooth',
          });
        } else if (elRect.bottom > parentRect.bottom - pad) {
          scrollParent.scrollBy({
            top: elRect.bottom - parentRect.bottom + pad,
            behavior: 'smooth',
          });
        }
      });
      return () => cancelAnimationFrame(raf);
    }, [activeIndex, collapsedSet]);

    const toggleCollapse = useCallback(
      (index: number) => {
        const next = new Set(collapsedSet);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        onCollapsedSetChange(next);
      },
      [collapsedSet, onCollapsedSetChange],
    );

    const getSubtreeParentIndices = useCallback(
      (targetIndex: number) => {
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
      },
      [tree],
    );

    const collapseSubtree = useCallback(
      (targetIndex: number) => {
        const indices = getSubtreeParentIndices(targetIndex);
        if (indices.length === 0) return;
        const next = new Set(collapsedSetRef.current);
        indices.forEach((index) => next.add(index));
        onCollapsedSetChangeRef.current(next);
      },
      [getSubtreeParentIndices],
    );

    const expandSubtree = useCallback(
      (targetIndex: number) => {
        const indices = getSubtreeParentIndices(targetIndex);
        if (indices.length === 0) return;
        const next = new Set(collapsedSetRef.current);
        indices.forEach((index) => next.delete(index));
        onCollapsedSetChangeRef.current(next);
      },
      [getSubtreeParentIndices],
    );

    // Get all parent (non-leaf) node indices
    const getParentIndices = useCallback((nodes: TreeNode[]): number[] => {
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
    }, []);

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
        const singleLevel1Index = isSingleLevel1 ? level1Nodes[0]!.index : -1;

        const newCollapsed = new Set<number>();
        const walk = (nodes: TreeNode[]) => {
          for (const node of nodes) {
            if (node.children.length > 0) {
              if (node.index === singleLevel1Index) {
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
        <Empty className="h-full">
          <EmptyDescription>未发现标题</EmptyDescription>
        </Empty>
      );
    }

    return (
      <div ref={containerRef} className="py-1.5" style={{ fontSize }}>
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
            portalContainer={portalContainer}
            onCollapseRecursive={collapseSubtree}
            onExpandRecursive={expandSubtree}
          />
        ))}
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
  portalContainer?: HTMLElement | null;
  onToggle: (index: number) => void;
  onJump: (index: number) => void;
  onHighlight: (index: number) => void;
  onCollapseRecursive: (index: number) => void;
  onExpandRecursive: (index: number) => void;
}

function TreeNodeItem(props: TreeNodeItemProps) {
  const {
    node,
    depth,
    collapsedSet,
    activeIndex,
    highlightOpacity = 30,
    nonLeafBlankAreaJump,
    portalContainer,
    onToggle,
    onJump,
    onHighlight,
    onCollapseRecursive,
    onExpandRecursive,
  } = props;
  const isLeaf = node.children.length === 0;
  const isCollapsed = collapsedSet.has(node.index);
  const isActive = activeIndex === node.index;
  const [menuVisible, setMenuVisible] = useState(false);

  return (
    <Collapsible open={!isCollapsed} onOpenChange={() => onToggle(node.index)}>
      <ContextMenu
        onOpenChange={(open) => {
          if (open) setMenuVisible(true);
        }}
        onOpenChangeComplete={(open) => {
          if (!open) setMenuVisible(false);
        }}
      >
        <ContextMenuTrigger
          render={<div />}
          data-active-row={isActive ? 'true' : undefined}
          className={cn(
            'group flex min-w-full w-fit items-center gap-0 rounded-md py-0 pr-2 cursor-pointer hover:bg-accent',
            isActive &&
              !menuVisible &&
              getActiveRowHighlightClass(highlightOpacity),
            menuVisible && 'bg-accent',
          )}
          style={{ paddingLeft: depth * 12 + 2 }}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) return;
            if (isLeaf || nonLeafBlankAreaJump || (event.target as HTMLElement).closest('[data-heading-text]')) onJump(node.index);
            else onToggle(node.index);
          }}
        >
          {!isLeaf ? (
            <CollapsibleTrigger
              render={<Button variant="ghost" size="icon-xs" className="size-5 bg-transparent transition-none active:not-aria-[haspopup]:translate-y-0 hover:bg-foreground/5 aria-expanded:bg-transparent aria-expanded:hover:bg-foreground/5" />}
              aria-label={`${isCollapsed ? '展开' : '折叠'} ${node.heading.text}`}
            >
              <ChevronDown
                className={cn(
                  'transition-transform',
                  isCollapsed && '-rotate-90',
                )}
              />
            </CollapsibleTrigger>
          ) : (
            <span className="size-5 shrink-0" />
          )}
          <span
            data-heading-text
            role="link"
            tabIndex={0}
            aria-current={isActive ? 'location' : undefined}
            className="shrink-0 whitespace-nowrap text-[length:inherit] font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                onJump(node.index);
              }
            }}
            onDoubleClick={() => onHighlight(node.index)}
          >
            {node.heading.text}
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent container={portalContainer} finalFocus={false}>
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => onJump(node.index)}>
              跳转到标题
            </ContextMenuItem>
            {!isLeaf && (
              <>
                <ContextMenuItem
                  onClick={() => onCollapseRecursive(node.index)}
                >
                  递归折叠
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onExpandRecursive(node.index)}>
                  递归展开
                </ContextMenuItem>
              </>
            )}
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
      {!isLeaf && (
        <CollapsibleContent>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.index}
              {...props}
              node={child}
              depth={depth + 1}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export default OutlineTree;
