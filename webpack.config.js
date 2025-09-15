const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');

const distPath = path.join(__dirname, 'dist');
const srcPath = path.join(__dirname, 'src');

module.exports = (env, argv = {}) => {
  const mode = argv.mode || 'production';
  const config = {
    devtool: 'cheap-module-source-map',
    entry: {
      popup: './src/index.jsx',
    },
    output: {
      filename: '[name].js',
      path: distPath,
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
          },
        },
      ],
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [{ from: 'manifest.json' }, { from: '_locales', to: '_locales' }, { from: 'static' }],
      }),
    ],
    resolve: {
      extensions: ['.js', '.jsx'],
      mainFields: ['module', 'jsnext:main', 'browser', 'main'],
    },
  };

  if (mode === 'production') {
    config.module.rules.unshift({
      enforce: 'pre',
      include: [srcPath],
      loader: 'eslint-loader',
      test: /\.(js|jsx)$/,
    });
    config.plugins.push(new CleanWebpackPlugin());
  }
  return config;
};
