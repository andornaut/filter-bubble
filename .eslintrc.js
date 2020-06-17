module.exports = {
  env: {
    browser: true,
    node: true,
    webextensions: true,
  },
  extends: ['airbnb-base'],
  parserOptions: {
    ecmaVersion: 2018,
  },
  plugins: ['eslint-plugin-import-order-alphabetical', 'import', 'sort-destructure-keys'],
  rules: {
    'class-methods-use-this': 0,
    'global-require': 0,
    'guard-for-in': 0,
    // Allow const x => y => x * y;
    'implicit-arrow-linebreak': 0,
    'import/no-dynamic-require': 0,
    'import/no-extraneous-dependencies': ['error', { devDependencies: ['**/**'] }],
    'import/prefer-default-export': 0,
    'import-order-alphabetical/order': [
      'error',
      {
        groups: [
          ['builtin', 'external'],
          ['internal', 'parent', 'sibling', 'index'],
        ],
        'newlines-between': 'always',
      },
    ],
    'max-len': ['error', { code: 120 }],
    'no-console': 0,
    'no-continue': 0,
    // Improve literacy of reduce() functions
    'no-param-reassign': 0,
    'no-restricted-syntax': ['error', 'WithStatement'],
    // Prefix symbols with underscore to denote private visibility
    'no-underscore-dangle': 0,
    'no-unused-expressions': ['error', { allowTaggedTemplates: true }],
    'sort-keys': ['error'],
    'sort-destructure-keys/sort-destructure-keys': ['error'],
  },
};
