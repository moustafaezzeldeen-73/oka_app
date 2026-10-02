// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*'],
  },
  {
    // These rules check code for the React Compiler, which this app doesn't
    // enable (app.json has no experiments.reactCompiler). They flag working
    // patterns here — Reanimated shared values written in handlers, data
    // loaded in effects. Turn them back on if the compiler is ever enabled.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
    },
  },
]);
