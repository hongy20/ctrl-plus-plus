import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Ctrl++',
        short_name: 'Ctrl++',
        description: 'Web Bluetooth Remote Control for LEGO Technic & Powered Up vehicles',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
      },
    }),
  ],
});
