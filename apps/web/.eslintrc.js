/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ['./node_modules/@latitude-data/eslint-config/library.js'],
  env: {
    node: true,
    browser: true,
  },
};
