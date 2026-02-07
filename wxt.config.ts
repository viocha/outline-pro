import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Outline Pro',
    description:
      'Smart outline generator with Sidebar and Floating modes for easy navigation.',
    version: '2.0.0',
    permissions: ['sidePanel', 'scripting', 'contextMenus', 'storage'],
    host_permissions: ['http://*/*', 'https://*/*', 'file://*/*'],
    commands: {
      'toggle-floating-outline': {
        suggested_key: { default: 'Alt+Q' },
        description: 'Toggle Floating Outline',
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
