import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardAction } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, updateSettings, type Settings } from '@/lib/types';

const shortcutLabels = [
  { name: '_execute_action', label: '切换大纲侧栏' },
  { name: 'toggle-floating-outline', label: '切换悬浮面板' },
];

export default function Options() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [commands, setCommands] = useState<chrome.commands.Command[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [shortcutError, setShortcutError] = useState('');
  const [opening, setOpening] = useState(false);
  const saving = useRef(false);

  const refreshCommands = useCallback(async () => {
    try {
      setCommands(await chrome.commands.getAll());
      setShortcutError('');
    } catch {
      setShortcutError('无法读取快捷键，请重新打开设置页');
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadSettings().then(value => { if (active) setSettings(value); }).catch(() => {
      if (active) setError('无法读取设置，请重新打开设置页');
    });
    void refreshCommands();
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'sync' && changes[SETTINGS_KEY]) {
        setSettings({ ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue as Partial<Settings> | undefined) });
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshCommands(); };
    chrome.storage.onChanged.addListener(onStorage);
    window.addEventListener('focus', refreshCommands);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onStorage);
      window.removeEventListener('focus', refreshCommands);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshCommands]);

  async function update(patch: Partial<Settings>) {
    if (!settings || saving.current) return;
    saving.current = true;
    setPending(true);
    setError('');
    try {
      const next = await updateSettings(patch);
      setSettings(next);
    } catch {
      setError('保存失败，请重试');
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  async function openShortcuts() {
    setOpening(true);
    try {
      const scheme = /Edg\//.test(navigator.userAgent) ? 'edge' : 'chrome';
      await chrome.tabs.create({ url: `${scheme}://extensions/shortcuts` });
      setShortcutError('');
    } catch {
      setShortcutError('无法打开快捷键设置，请前往浏览器的扩展管理 → 键盘快捷键');
    } finally {
      setOpening(false);
    }
  }

  return (
    <ScrollArea className="h-screen bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Outline Pro 设置</h1>
          </div>
        </header>

        {settings && <fieldset disabled={pending} className="flex min-w-0 flex-col gap-8">
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>显示</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-3">
                <Field orientation="horizontal" className="gap-6">
                  <FieldLabel htmlFor="font-size">字号</FieldLabel>
                  <Input
                    key={settings.fontSize}
                    id="font-size"
                    type="number"
                    min={10}
                    max={24}
                    step={1}
                    defaultValue={settings.fontSize}
                    className="w-20"
                    onBlur={event => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isInteger(value) && value >= 10 && value <= 24) {
                        if (value !== settings.fontSize) void update({ fontSize: value });
                      } else {
                        event.currentTarget.value = String(settings.fontSize);
                      }
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Escape') event.currentTarget.value = String(settings.fontSize);
                      if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
                    }}
                  />
                </Field>
                <SwitchField
                  id="highlight"
                  label="高亮当前标题"
                  disabled={pending}
                  checked={settings.autoHighlightActive}
                  onCheckedChange={value => void update({ autoHighlightActive: value })}
                />
                <OpacityField
                  key={settings.highlightOpacity}
                  value={settings.highlightOpacity}
                  disabled={pending || !settings.autoHighlightActive}
                  onCommit={value => void update({ highlightOpacity: value })}
                />
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={2}>导航</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <SwitchField
                  id="blank-jump"
                  label="点击空白跳转"
                  description="点击有子标题的大纲行空白处时，跳转到标题；关闭时展开或折叠。"
                  disabled={pending}
                  checked={settings.nonLeafBlankAreaJump}
                  onCheckedChange={value => void update({ nonLeafBlankAreaJump: value })}
                />
              </FieldGroup>
            </CardContent>
          </Card>
        </fieldset>}
        <Card>
          <CardHeader className="items-center">
            <CardTitle role="heading" aria-level={2}>快捷键</CardTitle>
            <CardAction>
              <Button variant="outline" disabled={opening} onClick={openShortcuts}>
                设置<ExternalLink data-icon="inline-end" />
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-sm">
              {shortcutLabels.map(item => {
                const shortcut = commands?.find(command => command.name === item.name)?.shortcut;
                return <div key={item.name}>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="font-medium">{item.label}</dt>
                    <dd>{shortcut ? <KbdGroup aria-label={shortcut}>{shortcut.split('+').map((key, index) => <Kbd key={index}>{key}</Kbd>)}</KbdGroup> : <span className="text-muted-foreground">{commands ? '未设置' : '—'}</span>}</dd>
                  </div>
                </div>;
              })}
            </dl>
          </CardContent>
        </Card>
        {(error || shortcutError) && <p role="alert" className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg border bg-background px-4 py-3 text-sm text-destructive shadow-sm">{error || shortcutError}</p>}
      </main>
    </ScrollArea>
  );
}

function SwitchField({ id, label, description, checked, disabled, onCheckedChange }: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Field
      orientation="horizontal"
      className="cursor-pointer"
      data-disabled={disabled}
      onClick={event => {
        // 标签和开关使用原生交互，仅补充说明与空白区域的点击。
        if (disabled || (event.target as Element).closest('label, [role="switch"], input')) return;
        onCheckedChange(!checked);
      }}
    >
      <FieldContent>
        <FieldLabel htmlFor={id} className="w-full cursor-pointer">{label}</FieldLabel>
        {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      </FieldContent>
      <Switch
        id={id}
        aria-describedby={description ? `${id}-description` : undefined}
        disabled={disabled}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </Field>
  );
}

function OpacityField({ value, disabled, onCommit }: {
  value: Settings['highlightOpacity'];
  disabled: boolean;
  onCommit: (value: Settings['highlightOpacity']) => void;
}) {
  const [draft, setDraft] = useState([value]);
  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldLabel id="opacity-label" htmlFor="opacity">高亮透明度</FieldLabel>
      <div className="flex w-40 shrink-0 items-center gap-3">
        <Slider
          id="opacity"
          aria-labelledby="opacity-label"
          min={10}
          max={50}
          step={10}
          value={draft}
          disabled={disabled}
          onValueChange={value => setDraft(value as Settings['highlightOpacity'][])}
          onValueCommitted={value => {
            const next = (Array.isArray(value) ? value[0] : value) as Settings['highlightOpacity'];
            if (next !== undefined) onCommit(next);
          }}
        />
        <output className="w-9 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{draft[0]}%</output>
      </div>
    </Field>
  );
}
