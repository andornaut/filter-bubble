module.exports = {
  "*.{css,json,md}": "prettier --write",
  "*.js": ["prettier --write", "eslint --fix"],
};
