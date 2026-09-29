import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', '.test-build/**', 'node_modules/**', 'coverage/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly', fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' }
    }
  },
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
);
