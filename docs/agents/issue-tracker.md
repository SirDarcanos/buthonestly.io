# Issue tracker: GitHub

Issues and specs for this repository live in GitHub Issues. Use the `gh` CLI for all operations and infer the repository from the current Git remote.

## Conventions

- Create issues with `gh issue create`.
- Read issues and comments with `gh issue view <number> --comments`.
- List issues with `gh issue list`.
- Comment with `gh issue comment`.
- Edit labels or assignees with `gh issue edit`.
- Close issues with `gh issue close`.
- Use heredocs for multiline issue bodies.

## Pull requests as a triage surface

PRs as a request surface: no.

## Skill operations

When a skill says “publish to the issue tracker,” create a GitHub issue.

When a skill says “fetch the relevant ticket,” read the issue and its comments.

Use GitHub sub-issues and native issue dependencies for ticket relationships where available. Fall back to task lists and `Blocked by: #<number>` lines when those features are unavailable.
