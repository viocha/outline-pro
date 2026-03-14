import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import {
  Minus,
  Plus,
  Ellipsis,
  RefreshCw,
  PanelRight,
  PictureInPicture2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type HeadingItem, buildTree, type TreeNode } from '@/lib/types';

interface OutlineHeaderProps {
  mode: 'sidepanel' | 'floating';
  headings: HeadingItem[];
  isRefreshing: boolean;
  autoHighlightActive: boolean;
  highlightOpacity: number;
  portalContainer?: HTMLElement | null;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onExpandToLevel: (level: number) => void;
  onSmartCollapse: (threshold: number) => void;
  onSwitchMode: () => void;
  onToggleAutoHighlight: () => void;
  onChangeHighlightOpacity: (v: number) => void;
  onClose?: () => void;
}

export default function OutlineHeader({
  mode,
  headings,
  isRefreshing,
  autoHighlightActive,
  highlightOpacity,
  portalContainer,
  onRefresh,
  onCollapseAll,
  onExpandAll,
  onExpandToLevel,
  onSmartCollapse,
  onSwitchMode,
  onToggleAutoHighlight,
  onChangeHighlightOpacity,
  onClose,
}: OutlineHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  let maxLevel = 0;
  headings.forEach((h) => {
    if (h.level > maxLevel) maxLevel = h.level;
  });
  const levelLimit = Math.max(maxLevel, 1);

  // Build tree and find the max children count across all nodes
  const tree = buildTree(headings);
  function getMaxChildrenCount(nodes: TreeNode[]): number {
    let max = 0;
    for (const node of nodes) {
      if (node.children.length > max) max = node.children.length;
      const childMax = getMaxChildrenCount(node.children);
      if (childMax > max) max = childMax;
    }
    return max;
  }
  const maxChildren = Math.max(tree.length, getMaxChildrenCount(tree));
  const allThresholds = [10, 20, 30, 40, 50];
  // Only show thresholds that are less than the max children count
  const validThresholds = allThresholds.filter((t) => maxChildren > t);

  return (
    <header
      className={cn(
        'flex items-center justify-between px-3 border-b border-border bg-white shrink-0 h-9 box-border select-none',
        mode === 'floating' && 'cursor-move select-none pr-2',
      )}
    >
      <div
        className={cn(
          'font-semibold text-sm text-text',
          mode === 'floating' && 'cursor-move flex-1',
        )}
      >
        Outline
      </div>

      <div className="flex gap-0.5 items-center cursor-default">
        {/* Switch mode button */}
        <Button
          variant="ghost"
          size="icon"
          title={
            mode === 'sidepanel' ? '切换到悬浮模式' : '切换到侧边栏'
          }
          onClick={onSwitchMode}
        >
          {mode === 'sidepanel' ? (
            <PictureInPicture2 className="size-4" />
          ) : (
            <PanelRight className="size-4" />
          )}
        </Button>

        {/* Collapse all */}
        <Button
          variant="ghost"
          size="icon"
          title="全部折叠"
          onClick={onCollapseAll}
        >
          <Minus className="size-4" />
        </Button>

        {/* Expand all */}
        <Button
          variant="ghost"
          size="icon"
          title="全部展开"
          onClick={onExpandAll}
        >
          <Plus className="size-4" />
        </Button>

        {/* Level menu */}
        {menuOpen && (
          <div
            className="fixed inset-0 z-40"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
            }}
          />
        )}
        <DropdownMenu
          modal={mode !== 'floating'}
          open={menuOpen}
          onOpenChange={setMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" title="选择展开层级">
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" container={portalContainer}>
            <DropdownMenuCheckboxItem
              checked={autoHighlightActive}
              onCheckedChange={onToggleAutoHighlight}
            >
              高亮当前标题
            </DropdownMenuCheckboxItem>
            {autoHighlightActive && (
              <>
                <DropdownMenuLabel>高亮透明度</DropdownMenuLabel>
                {([10, 20, 30, 40, 50] as const).map((op) => (
                  <DropdownMenuCheckboxItem
                    key={op}
                    checked={highlightOpacity === op}
                    onCheckedChange={() => onChangeHighlightOpacity(op)}
                  >
                    {op}%
                  </DropdownMenuCheckboxItem>
                ))}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Show Levels</DropdownMenuLabel>
            {Array.from({ length: Math.min(levelLimit, 6) }, (_, i) => i + 1).map(
              (level) => (
                <DropdownMenuItem
                  key={level}
                  onClick={() => onExpandToLevel(level)}
                >
                  Level {level}
                </DropdownMenuItem>
              ),
            )}
            {validThresholds.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Smart Collapse</DropdownMenuLabel>
                {validThresholds.map((t) => (
                  <DropdownMenuItem
                    key={t}
                    onClick={() => onSmartCollapse(t)}
                  >
                    &gt; {t} Items
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Refresh */}
        <Button
          variant="ghost"
          size="icon"
          title="刷新目录"
          onClick={onRefresh}
        >
          <RefreshCw
            className={cn('size-[15px]', isRefreshing && 'animate-spin')}
          />
        </Button>

        {/* Close (floating only) */}
        {mode === 'floating' && onClose && (
          <Button
            variant="ghost"
            size="icon"
            title="最小化/关闭"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </header>
  );
}
