import { defineConfig } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import eslintConfigPrettier from 'eslint-config-prettier'

/**
 * Base ESLint configuration for Latitude LLM monorepo
 * Uses ESLint 9 flat config format
 * Optimized for performance - no type-aware linting
 */
export default defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/build/**',
      '**/.turbo/**',
      '**/.*.js',
      '**/drizzle/**',
      '**/coverage/**',
    ],
  },
  // Base JavaScript rules
  js.configs.recommended,
  // TypeScript recommended rules (without type checking)
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
    },
    rules: {
      // Base rules
      'no-unused-vars': 'off',
      'no-case-declarations': 'warn',
      'no-constant-condition': 'off',
      // React hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // TypeScript overrides
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-namespace': 'off', // Allow namespaces for type organization
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // Disable new stricter rules from v8
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unnecessary-type-constraint': 'off',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/ban-ts-comment': 'warn',
    },
  },
  // Must be last - disables formatting rules that conflict with Prettier
  eslintConfigPrettier,
])

