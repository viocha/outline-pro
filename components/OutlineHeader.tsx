import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import type { HeadingItem } from '@/lib/types';

interface OutlineHeaderProps {
  mode: 'sidepanel' | 'floating';
  headings: HeadingItem[];
  isRefreshing: boolean;
  portalContainer?: HTMLElement | null;
  onRefresh: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onExpandToLevel: (level: number) => void;
  onSmartCollapse: (threshold: number) => void;
  onSwitchMode: () => void;
  onClose?: () => void;
}

export default function OutlineHeader({
  mode,
  headings,
  isRefreshing,
  portalContainer,
  onRefresh,
  onCollapseAll,
  onExpandAll,
  onExpandToLevel,
  onSmartCollapse,
  onSwitchMode,
  onClose,
}: OutlineHeaderProps) {
  let maxLevel = 0;
  headings.forEach((h) => {
    if (h.level > maxLevel) maxLevel = h.level;
  });
  const levelLimit = Math.max(maxLevel, 1);

  // Calculate max children count for smart collapse thresholds
  // We approximate by checking heading counts per parent
  const allThresholds = [10, 20, 30, 40, 50];
  // Simple heuristic: show thresholds if total headings exceed them
  const validThresholds = allThresholds.filter((t) => headings.length > t);

  return (
    <header
      className={cn(
        'flex items-center justify-between px-3 border-b border-border bg-white shrink-0 h-9 box-border',
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

      <div className="flex gap-0.5 items-center">
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
        <DropdownMenu modal={mode !== 'floating'}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" title="选择展开层级">
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" container={portalContainer}>
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
