import { vscodeBoundary } from './tools/eslint/vscode-boundary.mjs'
import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      'apps/desktop/resources/vision/**',
      'apps/desktop/resources/speech/**',
      'native/gestura-native/target/**'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    files: [
      'packages/pointer/**/*.{ts,tsx}',
      'packages/gestures/**/*.{ts,tsx}',
      'packages/intent/**/*.{ts,tsx}',
      'apps/desktop/src/utility/speech/**/*.{ts,tsx}'
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'http', message: 'Network access is forbidden in this boundary.' },
            { name: 'node:http', message: 'Network access is forbidden in this boundary.' },
            { name: 'https', message: 'Network access is forbidden in this boundary.' },
            { name: 'node:https', message: 'Network access is forbidden in this boundary.' },
            { name: 'net', message: 'Network access is forbidden in this boundary.' },
            { name: 'node:net', message: 'Network access is forbidden in this boundary.' },
            { name: 'dgram', message: 'Network access is forbidden in this boundary.' },
            { name: 'node:dgram', message: 'Network access is forbidden in this boundary.' },
            { name: 'undici', message: 'Network access is forbidden in this boundary.' },
            { name: 'node:undici', message: 'Network access is forbidden in this boundary.' },
            { name: 'axios', message: 'Network access is forbidden in this boundary.' },
            { name: 'node-fetch', message: 'Network access is forbidden in this boundary.' },
            {
              name: 'electron',
              importNames: ['net'],
              message: 'Electron net is forbidden in this boundary.'
            }
          ]
        }
      ],
      'no-restricted-modules': [
        'error',
        {
          paths: [
            'http',
            'node:http',
            'https',
            'node:https',
            'net',
            'node:net',
            'dgram',
            'node:dgram',
            'undici',
            'node:undici',
            'axios',
            'node-fetch',
            'electron'
          ]
        }
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Network access is forbidden in this boundary.' },
        { name: 'XMLHttpRequest', message: 'Network access is forbidden in this boundary.' },
        { name: 'WebSocket', message: 'Network access is forbidden in this boundary.' }
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'globalThis',
          property: 'fetch',
          message: 'Network access is forbidden in this boundary.'
        },
        {
          object: 'globalThis',
          property: 'XMLHttpRequest',
          message: 'Network access is forbidden in this boundary.'
        },
        {
          object: 'globalThis',
          property: 'WebSocket',
          message: 'Network access is forbidden in this boundary.'
        }
      ]
    }
  },
  {
    files: ['integrations/vscode/**/*.{ts,tsx,mjs}'],
    plugins: { gestura: { rules: { 'vscode-boundary': vscodeBoundary } } },
    rules: { 'gestura/vscode-boundary': 'error' }
  },
  eslintConfigPrettier,
  {
    files: ['native/gestura-native/**/*.mjs', 'scripts/**/*.mjs', 'tools/eslint/**/*.mjs'],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' }
  }
)
