// tsup.config.ts
import { defineConfig } from 'tsup'

const sharedErrors = {
  name: 'shared-errors',
  setup(build: {
    onResolve: (
      options: { filter: RegExp },
      callback: (args: { path: string }) => {
        external: boolean
        path: string
        sideEffects: boolean
      },
    ) => void
  }) {
    build.onResolve({ filter: /^\.\.?\/errors$/ }, () => ({
      external: true,
      path: '#errors',
      sideEffects: false,
    }))
  },
}

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    errors: 'src/errors.ts',
    'metrics/index': 'src/metrics/index.ts',
    'connectors/index': 'src/connectors/index.ts',
    'interop/index': 'src/interop/index.ts',
    'render/index': 'src/render/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2022',
  sourcemap: true,
  minify: true,
  treeshake: true,
  splitting: false,
  esbuildPlugins: [sharedErrors],
  outDir: 'dist',
})
