# Outline Pro

浏览器扩展，提供网页标题大纲，支持侧栏与可拖动、缩放的悬浮面板。界面使用 shadcn/ui base-nova 官方组件。

## 开发

使用 Bun 1 管理依赖：

```sh
bun install
bun run dev
bun run typecheck
bun run build
bun run build:reload
```

`postinstall` 生成 WXT 类型配置。`typecheck` 执行 TypeScript 检查。构建产物位于 `.output/chrome-mv3`。

`reload` 使用 reload-extension 重载浏览器中已安装的 Outline Pro。`build:reload` 构建后重载扩展。

## 界面

工具栏提供模式切换、展开、折叠和刷新操作。「更多选项」菜单提供高亮当前标题、点击空白跳转的快捷开关及高亮透明度切换，以及展开层级、智能折叠操作和设置入口。大纲行右键菜单提供跳转及递归展开、折叠操作。

悬浮面板使用 Shadow DOM 隔离样式，菜单通过 portal 挂载在相同的 Shadow DOM 内，工具栏提示使用原生 title。官方滚动组件扩展 `viewportRef`，用于恢复目录滚动位置。

## 设置

从「更多选项」菜单点击「设置」，或在浏览器扩展管理中打开扩展选项。设置页提供字号、当前标题高亮、高亮透明度和点击空白跳转选项，修改后自动保存并在侧栏与悬浮面板间同步。

快捷键区域显示浏览器当前生效的绑定，未绑定的操作显示「未设置」。点击快捷键区域的「设置」打开浏览器的扩展快捷键页面，返回设置页后自动刷新绑定。
