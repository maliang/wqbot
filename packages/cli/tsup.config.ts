import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: 'node20',
  external: ['react', 'ink'],
  banner: {
    js: '#!/usr/bin/env node',
  },
})
