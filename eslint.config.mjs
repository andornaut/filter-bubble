import js from '@eslint/js';

export default [
  js.configs.recommended,
  // Configuration files (webpack, babel, etc.)
  {
    files: ['*.config.js', '.eslintrc.js', '.lintstagedrc.js', '.prettierrc.js', 'babel.config.js', 'jest.config.js', 'web-ext-config.js', 'webpack.config.js'],
    ignores: ['node_modules/**'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'no-console': 'off'
    }
  },
  // Static extension files (background.js, content-script.js)
  {
    files: ['static/**/*.js'],
    ignores: ['node_modules/**'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        MutationObserver: 'readonly'
      }
    },
    rules: {
      'no-console': 'off',
      'no-unused-expressions': ['error', { allowTaggedTemplates: true }]
    }
  },
  // React source files
  {
    files: ['src/**/*.js', 'src/**/*.jsx'],
    ignores: ['dist/**', 'node_modules/**', 'web-ext-artifacts/**'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      'no-console': 'off',
      'no-continue': 'off',
      'no-param-reassign': 'off',
      'no-underscore-dangle': 'off',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^(React|.*Component|.*List|.*Field|.*Content|App|Root|Topics|Websites)$'
      }],
      'max-len': ['error', { code: 140 }], // Relaxed for JSX
      'no-undef': 'error'
    }
  },
  // Test files
  {
    files: ['src/**/*.test.js', 'src/**/*.test.jsx', 'src/test-setup.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        jest: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        global: 'writable',
        chrome: 'readonly'
      }
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^React$|^App$' // Allow unused React and component imports
      }],
      'max-len': ['error', { code: 140 }]
    }
  }
];