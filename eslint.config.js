import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import vueParser from 'vue-eslint-parser'
import tsParser from '@typescript-eslint/parser'
import importX from 'eslint-plugin-import-x'

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  prettier,

  {
    files: ['src/**/*.{ts,vue}'],
    plugins: { 'import-x': importX },
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/attributes-order': 'off', 
      'no-undef': 'off', 

      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn', 
      'vue/no-unused-vars': 'warn',
      'no-console': 'warn',

      'import-x/no-cycle': 'warn',
    },
  },

  { ignores: ['dist/', 'node_modules/'] },
]
