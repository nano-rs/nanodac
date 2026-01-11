import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  target: 'node18',
  platform: 'node',
  // Keep all dependencies external - they'll be installed via npm
  external: ['chalk', 'commander', 'fast-glob', 'yaml', '@nanodac/core'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
