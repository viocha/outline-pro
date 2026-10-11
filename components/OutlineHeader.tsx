import { useId, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  fontSize: number;
  onChangeFontSize: (value: number) => void;
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
  fontSize,
  onChangeFontSize,
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
  const fontSizeId = useId();
  const [fontSizeEditing, setFontSizeEditing] = useState(false);
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
    <TooltipProvider delay={500} timeout={0}>
      <header
        className={cn(
          'flex h-9 shrink-0 items-center justify-between border-b border-border bg-background/95 px-3 box-border select-none backdrop-blur supports-[backdrop-filter]:bg-background/85',
          mode === 'floating' && 'cursor-move select-none pr-2',
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

        <div className="flex shrink-0 items-center gap-0.5">
          {/* Switch mode button */}
          <ToolbarButton
            portalContainer={portalContainer}
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
            portalContainer={portalContainer}
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
            portalContainer={portalContainer}
            variant="ghost"
            size="icon-sm"
            aria-label="全部展开"
            label="全部展开"
            onClick={onExpandAll}
          >
            <Plus />
          </ToolbarButton>

          <DropdownMenu modal={mode !== 'floating'} highlightItemOnHover={!fontSizeEditing}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" />}
                  />
                }
                aria-label="目录选项"
              >
                <Ellipsis />
              </TooltipTrigger>
              <TooltipContent container={portalContainer}>
                目录选项
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              initialFocus={false}
              align="end"
              container={portalContainer}
              finalFocus={false}
              className="w-max"
            >
              <DropdownMenuGroup>
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
              <Field orientation="horizontal" className="px-1.5 py-1">
                <FieldLabel
                  htmlFor={fontSizeId}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.preventDefault();
                    const root = event.currentTarget.getRootNode() as Document | ShadowRoot;
                    const input = root.getElementById(fontSizeId) as HTMLInputElement | null;
                    if (root.activeElement === input) input?.blur();
                    else input?.focus({ preventScroll: true });
                  }}
                >字号</FieldLabel>
                <Input
                  id={fontSizeId}
                  type="number"
                  min={10}
                  max={24}
                  step={1}
                  defaultValue={fontSize}
                  className="w-20"
                  onFocus={() => setFontSizeEditing(true)}
                  onKeyDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    if (Number.isInteger(value) && value >= 10 && value <= 24) {
                      onChangeFontSize(value);
                    }
                  }}
                  onBlur={(event) => {
                    setFontSizeEditing(false);
                    event.target.value = String(fontSize);
                  }}
                />
              </Field>
                {autoHighlightActive && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>高亮透明度</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent container={portalContainer}>
                      <DropdownMenuRadioGroup
                        value={String(highlightOpacity)}
                        onValueChange={(value) =>
                          onChangeHighlightOpacity(Number(value))
                        }
                      >
                        <DropdownMenuLabel>高亮透明度</DropdownMenuLabel>
                        {([10, 20, 30, 40, 50] as const).map((op) => (
                          <DropdownMenuRadioItem key={op} value={String(op)}>
                            {op}%
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}

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
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh */}
          <ToolbarButton
            portalContainer={portalContainer}
            variant="ghost"
            size="icon-sm"
            aria-label="刷新目录"
            label="刷新目录"
            disabled={isRefreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={cn(isRefreshing && 'animate-spin')} />
          </ToolbarButton>

          {/* Close (floating only) */}
          {mode === 'floating' && onClose && (
            <ToolbarButton
              portalContainer={portalContainer}
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
    </TooltipProvider>
  );
}

function ToolbarButton({
  label,
  portalContainer,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  label: string;
  portalContainer?: HTMLElement | null;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button {...props} />} aria-label={label}>
        {children}
      </TooltipTrigger>
      <TooltipContent container={portalContainer}>{label}</TooltipContent>
    </Tooltip>
  );
}
