import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Ensures paths are relative for Electron's file:// protocol
});
