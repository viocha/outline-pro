import { useRef, useState, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { type HeadingItem, buildTree, type TreeNode, type Settings, updateSettings } from '@/lib/types';

interface OutlineHeaderProps {
  mode: 'sidepanel' | 'floating';
  headings: HeadingItem[];
  settings: Settings;
  isRefreshing: boolean;
  portalContainer?: HTMLElement | null;
  onDragHandleMouseDown?: (e: React.MouseEvent) => void;
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
  settings,
  isRefreshing,
  portalContainer,
  onDragHandleMouseDown,
  onRefresh,
  onCollapseAll,
  onExpandAll,
  onExpandToLevel,
  onSmartCollapse,
  onSwitchMode,
  onClose,
}: OutlineHeaderProps) {
  const savingSettingRef = useRef(false);
  const [opacityMenuOpen, setOpacityMenuOpen] = useState(false);
  const [opacityMenuVisible, setOpacityMenuVisible] = useState(false);

  async function changeSetting(patch: Partial<Settings>) {
    if (savingSettingRef.current) return;
    savingSettingRef.current = true;
    try {
      await updateSettings(patch);
    } catch (error) {
      console.error('保存目录设置失败', error);
    } finally {
      savingSettingRef.current = false;
    }
  }

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
          'flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/95 px-3 box-border select-none backdrop-blur supports-[backdrop-filter]:bg-background/85',
          mode === 'floating' && 'pr-2',
        )}
      >
        <div
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-foreground',
            mode === 'floating' && 'cursor-move flex-1',
          )}
          onMouseDown={mode === 'floating' ? onDragHandleMouseDown : undefined}
        >
          Outline
        </div>

        <div className="flex shrink-0 cursor-default items-center">
          {/* Switch mode button */}
          <ToolbarButton
            variant="ghost"
            size="icon-sm"
            aria-label={
              mode === 'sidepanel' ? '切换到悬浮模式' : '切换到侧边栏'
            }
            label={mode === 'sidepanel' ? '切换到悬浮模式' : '切换到侧边栏'}
            onClick={onSwitchMode}
          >
            {mode === 'sidepanel' ? <PictureInPicture2 /> : <PanelRight />}
          </ToolbarButton>

          {/* Collapse all */}
          <ToolbarButton
            variant="ghost"
            size="icon-sm"
            aria-label="全部折叠"
            label="全部折叠"
            onClick={onCollapseAll}
          >
            <Minus />
          </ToolbarButton>

          {/* Expand all */}
          <ToolbarButton
            variant="ghost"
            size="icon-sm"
            aria-label="全部展开"
            label="全部展开"
            onClick={onExpandAll}
          >
            <Plus />
          </ToolbarButton>

          <DropdownMenu modal={mode !== 'floating'}>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" />}
              aria-label="更多选项"
              title="更多选项"
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              initialFocus={false}
              align="end"
              container={portalContainer}
              finalFocus={false}
              className="w-max"
            >
              <DropdownMenuGroup>
                <DropdownMenuCheckboxItem
                  checked={settings.nonLeafBlankAreaJump}
                  onCheckedChange={checked => void changeSetting({ nonLeafBlankAreaJump: checked })}
                >
                  点击空白跳转
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={settings.autoHighlightActive}
                  onCheckedChange={checked => void changeSetting({ autoHighlightActive: checked })}
                >
                  高亮当前标题
                </DropdownMenuCheckboxItem>
                <DropdownMenuSub
                  open={opacityMenuOpen}
                  onOpenChange={open => {
                    setOpacityMenuOpen(open);
                    if (open) setOpacityMenuVisible(true);
                  }}
                  onOpenChangeComplete={open => {
                    if (!open) setOpacityMenuVisible(false);
                  }}
                >
                  <DropdownMenuSubTrigger className={cn(opacityMenuVisible && 'bg-accent text-accent-foreground')}>
                    高亮透明度
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent container={portalContainer} finalFocus={interactionType => interactionType === 'keyboard'}>
                    <DropdownMenuRadioGroup
                      value={String(settings.highlightOpacity)}
                      onValueChange={value => void changeSetting({ highlightOpacity: Number(value) as Settings['highlightOpacity'] })}
                    >
                      {([10, 20, 30, 40, 50] as const).map(opacity => (
                        <DropdownMenuRadioItem key={opacity} value={String(opacity)} closeOnClick={false} onClick={() => setOpacityMenuOpen(false)}>
                          {opacity}%
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>展开层级</DropdownMenuLabel>
                {Array.from(
                  { length: Math.min(levelLimit, 6) },
                  (_, i) => i + 1,
                ).map((level) => (
                  <DropdownMenuItem
                    key={level}
                    onClick={() => onExpandToLevel(level)}
                  >
                    第 {level} 级
                  </DropdownMenuItem>
                ))}
                {validThresholds.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>智能折叠</DropdownMenuLabel>
                    {validThresholds.map((t) => (
                      <DropdownMenuItem
                        key={t}
                        onClick={() => onSmartCollapse(t)}
                      >
                        超过 {t} 项
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => {
                  void chrome.runtime.sendMessage({ action: 'OPEN_OPTIONS' }).catch(console.error);
                }}>
                  设置
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh */}
          <ToolbarButton
            variant="ghost"
            size="icon-sm"
            aria-label="刷新大纲"
            label="刷新大纲"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
          </ToolbarButton>

          {/* Close (floating only) */}
          {mode === 'floating' && onClose && (
            <ToolbarButton
                variant="ghost"
              size="icon-sm"
              aria-label="关闭悬浮面板"
              label="关闭悬浮面板"
              onClick={onClose}
            >
              <X />
            </ToolbarButton>
          )}
        </div>
      </header>
  );
}

function ToolbarButton({
  label,
  children,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  label: string;
}) {
  return (
    <Button
      {...props}
      className={cn('cursor-pointer disabled:pointer-events-auto disabled:opacity-100', className)}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  );
}
