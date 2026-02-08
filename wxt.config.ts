import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Outline Pro',
    description:
      '智能大纲生成器，支持侧栏和悬浮两种模式，轻松导航页面内容。',
    permissions: ['sidePanel', 'scripting', 'contextMenus', 'storage'],
    host_permissions: ['http://*/*', 'https://*/*', 'file://*/*'],
    action: {
      default_title: 'Open Outline Pro',
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+Q' },
        description: '切换大纲侧栏面板',
      },
      'toggle-floating-outline': {
        suggested_key: { default: 'Alt+Q' },
        description: '切换大纲悬浮面板',
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, '.'),
      },
    },
  }),
});
