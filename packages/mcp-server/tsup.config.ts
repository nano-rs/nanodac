import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Bundle all dependencies for standalone execution
  noExternal: [/.*/],
  // Node.js platform settings
  platform: 'node',
  target: 'node18',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
