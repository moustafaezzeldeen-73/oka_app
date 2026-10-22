// Flat config for the OKA theme assets (browser scripts, not modules).
export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', location: 'readonly', history: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly', fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        CustomEvent: 'readonly', MutationObserver: 'readonly', IntersectionObserver: 'readonly', ResizeObserver: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', requestIdleCallback: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
        performance: 'readonly', matchMedia: 'readonly', screen: 'readonly', console: 'readonly', Element: 'readonly',
        CSS: 'readonly', customElements: 'readonly', Promise: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'after-used', caughtErrors: 'none' }], eqeqeq: ['warn', 'smart'],
      'no-redeclare': 'error', 'no-shadow': 'warn', 'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-fallthrough': 'error',
      'no-self-assign': 'error', 'no-unsafe-finally': 'error', 'no-async-promise-executor': 'error', 'require-atomic-updates': 'off',
      'no-cond-assign': 'error', 'no-empty': ['warn', { allowEmptyCatch: true }], 'no-useless-escape': 'warn', 'no-constant-condition': 'warn',
      'no-sequences': 'error', 'no-loop-func': 'warn', 'array-callback-return': 'warn', 'no-promise-executor-return': 'warn',
    },
  },
];
