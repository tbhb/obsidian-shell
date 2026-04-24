import './dangerfile.lite';

// Runtime globals injected by Danger. Declared locally for the same reason as dangerfile.lite.ts.
interface DangerContext {
  readonly github?: {
    readonly pr?: {
      readonly title?: string;
      readonly body?: string | null;
      readonly draft?: boolean;
      readonly assignees?: readonly unknown[];
      readonly requested_reviewers?: readonly unknown[];
      readonly requested_teams?: readonly unknown[];
    };
  };
}

declare const danger: DangerContext;
declare function fail(message: string): void;
declare function warn(message: string): void;

const CONVENTIONAL_TITLE =
  /^(?:feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)(?:\([a-z0-9-]+\))?!?: .+$/;
const ISSUE_REF = /(?:#\d+|(?:Fixes|Closes|Resolves)\s+#\d+)/i;
const WIP_MARKERS = /\b(?:WIP|DO NOT MERGE|\[draft\]|\[wip\])\b/i;

interface PrContext {
  readonly title: string;
  readonly body: string;
  readonly draft: boolean;
  readonly assigneeCount: number;
  readonly reviewerCount: number;
}

function readPr(): PrContext | null {
  const pr = danger.github?.pr;
  if (pr === undefined) return null;
  return {
    title: pr.title ?? '',
    body: pr.body ?? '',
    draft: pr.draft ?? false,
    assigneeCount: pr.assignees?.length ?? 0,
    reviewerCount: (pr.requested_reviewers?.length ?? 0) + (pr.requested_teams?.length ?? 0),
  };
}

function checkTitle(pr: PrContext): void {
  if (!CONVENTIONAL_TITLE.test(pr.title)) {
    fail(
      'PR title must follow conventional commits: `type(scope)?: subject`. Squash-merge uses the title as the commit message, and release-please parses it.',
    );
  }
}

function checkBody(pr: PrContext): void {
  if (pr.body.trim().length < 20) {
    fail('PR description is empty or shorter than 20 characters. Describe the change.');
    return;
  }
  if (!ISSUE_REF.test(pr.body)) {
    warn(
      'PR description has no linked issue (`#123`, `Fixes #123`, `Closes #123`, `Resolves #123`).',
    );
  }
}

function checkWipMarkers(pr: PrContext): void {
  if (WIP_MARKERS.test(pr.title) && !pr.draft) {
    fail(
      'PR title carries a WIP/draft marker but the PR is not marked as draft on GitHub. Mark it draft or remove the marker.',
    );
  }
}

function checkReviewAssignment(pr: PrContext): void {
  if (pr.assigneeCount === 0) {
    warn('PR has no assignees.');
  }
  if (pr.reviewerCount === 0) {
    warn('PR has no reviewers requested.');
  }
}

const pr = readPr();
if (pr !== null) {
  checkTitle(pr);
  checkBody(pr);
  checkWipMarkers(pr);
  checkReviewAssignment(pr);
}
