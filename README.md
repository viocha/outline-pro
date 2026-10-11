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

工具栏提供模式切换、展开、折叠和刷新操作。目录选项菜单包含高亮、点击空白跳转、展开层级与智能折叠设置。目录行右键菜单提供跳转及递归展开、折叠操作。

悬浮面板使用 Shadow DOM 隔离样式，菜单和提示通过 portal 挂载在相同的 Shadow DOM 内。官方滚动组件扩展 `viewportRef`，用于恢复目录滚动位置。
