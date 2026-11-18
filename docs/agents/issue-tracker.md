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

## Specification and work-ticket labels

| Role          | GitHub label          | Apply to                                                                                                   |
| ------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| Specification | `specification`       | The authoritative agreement and acceptance criteria for a change.                                          |
| Work ticket   | `implementation-step` | A bounded deliverable under a specification, including implementation, design, validation, or manual work. |

Apply exactly one of these role labels to each specification or work ticket; do not apply both. A standalone issue does not need an artificial specification parent. Use native sub-issues to identify a work ticket's owning specification; the role label does not establish parentage or execution order.

Assess readiness separately using [the triage label mappings](triage-labels.md). Use `ready-for-agent` when the defined next action is actionable by an agent, or `ready-for-human` when it requires a human decision or capability. A blocked ticket can still carry its appropriate readiness label: native dependencies determine whether it can start. Role and readiness labels do not authorize dispatch or prove completion. Preserve unrelated labels when applying them.

## Pull requests as a triage surface

PRs as a request surface: no.

## Skill operations

When a skill says “publish to the issue tracker,” create a GitHub issue.

When a skill says “fetch the relevant ticket,” read the issue and its comments.

Use GitHub sub-issues and native issue dependencies for ticket relationships where available. Fall back to task lists and `Blocked by: #<number>` lines when those features are unavailable.
