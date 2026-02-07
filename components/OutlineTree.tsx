import { useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TreeNode, HeadingItem } from '@/lib/types';
import { buildTree } from '@/lib/types';

export interface OutlineTreeRef {
  collapseAll: () => void;
  expandAll: () => void;
  expandToLevel: (level: number) => void;
  smartCollapse: (threshold: number) => void;
}

interface OutlineTreeProps {
  headings: HeadingItem[];
  onJump: (index: number) => void;
  onHighlight: (index: number) => void;
}

const OutlineTree = forwardRef<OutlineTreeRef, OutlineTreeProps>(
  ({ headings, onJump, onHighlight }, ref) => {
    const [collapsedSet, setCollapsedSet] = useState<Set<number>>(new Set());
    const tree = buildTree(headings);

    const toggleCollapse = useCallback((index: number) => {
      setCollapsedSet((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    }, []);

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
      setCollapsedSet(new Set(getParentIndices(tree)));
    }, [tree, getParentIndices]);

    const expandAll = useCallback(() => {
      setCollapsedSet(new Set());
    }, []);

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
        setCollapsedSet(newCollapsed);
      },
      [tree],
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
        setCollapsedSet(newCollapsed);
      },
      [tree],
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
      <div className="py-1.5">
        {tree.map((node) => (
          <TreeNodeItem
            key={node.index}
            node={node}
            collapsedSet={collapsedSet}
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
  onToggle: (index: number) => void;
  onJump: (index: number) => void;
  onHighlight: (index: number) => void;
}

function TreeNodeItem({
  node,
  collapsedSet,
  onToggle,
  onJump,
  onHighlight,
}: TreeNodeItemProps) {
  const isLeaf = node.children.length === 0;
  const isCollapsed = collapsedSet.has(node.index);
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
        className={cn(
          'group flex items-center py-[2px] pr-1 cursor-pointer rounded select-none transition-colors duration-100',
          'hover:bg-bg-hover',
          'min-w-full w-fit box-border',
        )}
        style={{ paddingLeft: 0 }}
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
