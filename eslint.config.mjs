import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    languageOptions: {
      parser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  files: ['**/*.ts'],
  },
];
