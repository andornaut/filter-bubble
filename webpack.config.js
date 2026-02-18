const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const ESLintPlugin = require("eslint-webpack-plugin");
const path = require("path");

const distPath = path.join(__dirname, "dist");

module.exports = (env, argv = {}) => {
  const mode = argv.mode || "production";
  const config = {
    devtool: mode === "production" ? false : "cheap-module-source-map",
    entry: {
      popup: "./src/index.js",
    },
    module: {
      rules: [
        {
          exclude: /node_modules/,
          test: /\.jsx?$/,
          use: {
            loader: "babel-loader",
            options: {
              presets: ["@babel/preset-react"],
            },
          },
        },
      ],
    },
    output: {
      filename: "[name].js",
      path: distPath,
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [{ from: "manifest.json" }, { from: "_locales", to: "_locales" }, { from: "static" }],
      }),
    ],
    resolve: {
      extensions: [".js", ".jsx"],
      mainFields: ["module", "jsnext:main", "browser", "main"],
    },
  };

  if (mode === "production") {
    config.plugins.push(new ESLintPlugin({ extensions: ["js", "jsx"] }), new CleanWebpackPlugin());
  }
  return config;
};
