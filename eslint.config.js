const js = require('@eslint/js');
const jestPlugin = require('eslint-plugin-jest');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['**/__tests__/**/*.js'],
    ...jestPlugin.configs['flat/recommended'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      }
    }
  },
  {
    ignores: ['coverage/**', 'node_modules/**']
  }
];
