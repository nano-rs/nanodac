import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // Actions don't need types
  clean: true,
  sourcemap: false,
  // Bundle all dependencies for the action
  noExternal: [/(.*)/],
});
