import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  nonLeafBlankAreaJump: boolean;
  portalContainer?: HTMLElement | null;
  onDragHandleMouseDown?: (e: React.MouseEvent) => void;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onExpandToLevel: (level: number) => void;
  onSmartCollapse: (threshold: number) => void;
  onSwitchMode: () => void;
  onToggleAutoHighlight: () => void;
  onChangeHighlightOpacity: (v: number) => void;
  onToggleNonLeafBlankAreaJump: () => void;
  onClose?: () => void;
}

export default function OutlineHeader({
  mode,
  headings,
  isRefreshing,
  autoHighlightActive,
  highlightOpacity,
  nonLeafBlankAreaJump,
  portalContainer,
  onDragHandleMouseDown,
  onRefresh,
  onCollapseAll,
  onExpandAll,
  onExpandToLevel,
  onSmartCollapse,
  onSwitchMode,
  onToggleAutoHighlight,
  onChangeHighlightOpacity,
  onToggleNonLeafBlankAreaJump,
  onClose,
}: OutlineHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightSubmenuOpen, setHighlightSubmenuOpen] = useState(false);
  const closeHighlightSubmenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearHighlightSubmenuCloseTimer = () => {
    if (closeHighlightSubmenuTimerRef.current !== null) {
      clearTimeout(closeHighlightSubmenuTimerRef.current);
      closeHighlightSubmenuTimerRef.current = null;
    }
  };

  const openHighlightSubmenu = () => {
    clearHighlightSubmenuCloseTimer();
    setHighlightSubmenuOpen(true);
  };

  const scheduleCloseHighlightSubmenu = () => {
    clearHighlightSubmenuCloseTimer();
    closeHighlightSubmenuTimerRef.current = setTimeout(() => {
      setHighlightSubmenuOpen(false);
      closeHighlightSubmenuTimerRef.current = null;
    }, 120);
  };

  useEffect(() => {
    if (!menuOpen) {
      clearHighlightSubmenuCloseTimer();
      setHighlightSubmenuOpen(false);
    }
    return () => {
      clearHighlightSubmenuCloseTimer();
    };
  }, [menuOpen]);

  return (
    <header
      className={cn(
        'flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/95 px-3 box-border select-none backdrop-blur supports-[backdrop-filter]:bg-background/85',
        mode === 'floating' && 'cursor-move select-none pr-2',
      )}
    >
      <div
        className={cn(
          'text-sm font-semibold tracking-tight text-foreground',
          mode === 'floating' && 'cursor-move flex-1',
        )}
        onMouseDown={mode === 'floating' ? onDragHandleMouseDown : undefined}
      >
        Outline
      </div>

      <div className="flex items-center gap-0.5 cursor-default">
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
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
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
              checked={nonLeafBlankAreaJump}
              onCheckedChange={onToggleNonLeafBlankAreaJump}
            >
              点击空白跳转而非折叠
            </DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem
              checked={autoHighlightActive}
              onCheckedChange={onToggleAutoHighlight}
            >
              高亮当前标题
            </DropdownMenuCheckboxItem>
            {autoHighlightActive && (
              <DropdownMenuSub
                open={highlightSubmenuOpen}
                onOpenChange={setHighlightSubmenuOpen}
              >
                <DropdownMenuSubTrigger
                  onPointerMove={openHighlightSubmenu}
                  onPointerLeave={scheduleCloseHighlightSubmenu}
                  onClick={openHighlightSubmenu}
                >
                  高亮透明度
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  container={portalContainer}
                  onPointerEnter={openHighlightSubmenu}
                  onPointerLeave={scheduleCloseHighlightSubmenu}
                >
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
                </DropdownMenuSubContent>
              </DropdownMenuSub>
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
