const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const ESLintPlugin = require('eslint-webpack-plugin');
const path = require('path');

const distPath = path.join(__dirname, 'dist');

module.exports = (env, argv = {}) => {
  const mode = argv.mode || 'production';
  const config = {
    devtool: 'cheap-module-source-map',
    entry: {
      popup: './src/index.js',
    },
    output: {
      filename: '[name].js',
      path: distPath,
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [{ from: 'manifest.json' }, { from: '_locales', to: '_locales' }, { from: 'static' }],
      }),
    ],
    resolve: {
      mainFields: ['module', 'jsnext:main', 'browser', 'main'],
    },
  };

  if (mode === 'production') {
    config.plugins.push(new ESLintPlugin({ extensions: ['js', 'jsx'] }), new CleanWebpackPlugin());
  }
  return config;
};
