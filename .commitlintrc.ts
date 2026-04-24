import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Subject line no longer than 100 chars. Body and footer up to 120.
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 120],
    'footer-max-line-length': [2, 'always', 120],
    // config-conventional sets these at warning. Escalate so the pre-push
    // and commit-msg hooks actually block malformed commits.
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [2, 'always'],
    // Reject near-empty subjects. 15 chars leaves room for the shortest
    // release-please commit (`release 0.1.0 (#2)` = 18) without being tight.
    'subject-min-length': [2, 'always', 15],
    // Allow-list the scopes used by automation and ad-hoc tooling commits.
    // Empty scope stays allowed (no `scope-empty` override), so scope-less
    // commits like `feat: ...` pass. Extend this list as new scopes land.
    //
    //   - `ci`                automated pipeline edits and manual CI tweaks
    //   - `deps`              dependabot npm / github-actions updates
    //   - `deps-dev`          dependabot devDependency bumps
    //   - `dev-dependencies`  dependabot grouped bumps (group name in
    //                         `.github/dependabot.yml`)
    //   - `e2e`               end-to-end test scaffolding and fixtures
    //   - `main`              release-please release PRs
    //   - `release`           manual edits to release scripts or workflows
    'scope-enum': [
      2,
      'always',
      ['ci', 'deps', 'deps-dev', 'dev-dependencies', 'e2e', 'main', 'release'],
    ],
  },
};

export default config;
