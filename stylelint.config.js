/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: [
    "output/**",
    "coverage/**",
    ".wxt/**",
    "test-results/**",
    "website/_site/**",
    "website/vendor/**",
    "website/.jekyll-cache/**",
  ],
};
