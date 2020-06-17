const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

const srcPath = path.join(__dirname, 'src');

module.exports = (env, argv = {}) => {
  const mode = argv.mode || 'production';
  const config = {
    devtool: 'cheap-module-source-map',
    entry: {
      popup: './src/index.js',
    },
    output: {
      filename: '[name].js',
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
    config.module = {
      rules: [
        {
          enforce: 'pre',
          include: [srcPath],
          loader: 'eslint-loader',
          test: /\.(js|jsx)$/,
        },
      ],
    };
    config.plugins.push(new CleanWebpackPlugin());
  }
  return config;
};
