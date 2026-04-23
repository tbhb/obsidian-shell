/** @type {import("@commitlint/types").UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Subject line no longer than 100 chars; body/footer up to 120.
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 120],
    'footer-max-line-length': [2, 'always', 120],
  },
};
