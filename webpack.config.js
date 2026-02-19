const CopyWebpackPlugin = require("copy-webpack-plugin");
const ESLintPlugin = require("eslint-webpack-plugin");
const path = require("path");

module.exports = (env, argv = {}) => {
  const mode = argv.mode || "production";
  return {
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
              presets: [["@babel/preset-react", { runtime: "automatic" }]],
            },
          },
        },
      ],
    },
    output: {
      clean: true,
      filename: "[name].js",
      path: path.join(__dirname, "dist"),
    },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [{ from: "manifest.json" }, { from: "_locales", to: "_locales" }, { from: "static" }],
      }),
      new ESLintPlugin({
        emitWarning: mode !== "production",
        extensions: ["js", "jsx"],
        failOnError: mode === "production",
      }),
    ],
    resolve: {
      extensions: [".js", ".jsx"],
    },
  };
};
