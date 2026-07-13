import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const typescriptFiles = ['**/*.{ts,tsx,mts,cts}']

export default tseslint.config(
  {
    name: 'glucoseiq/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.source/**',
      '**/.turbo/**',
      '**/.temp/**',
      '**/.tmp/**',
      '**/tmp/**',
      '**/next-env.d.ts',
      'docs/**',
      'markdown/**',
      'packages/core/docs-md/**',
    ],
  },
  {
    ...js.configs.recommended,
    name: 'glucoseiq/javascript',
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: config.files ?? typescriptFiles,
  })),
  {
    name: 'glucoseiq/typescript-globals',
    files: typescriptFiles,
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ...reactHooks.configs.flat.recommended,
    name: 'glucoseiq/react-hooks',
    files: [
      'apps/docs/**/*.{ts,tsx}',
      'packages/react/**/*.{ts,tsx}',
    ],
  },
  {
    name: 'glucoseiq/malformed-input-fixtures',
    files: ['packages/core/tests/connectors.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
)
