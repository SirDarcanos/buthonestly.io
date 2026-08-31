import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const workflow = readFileSync(
  path.join(root, ".github/workflows/lighthouse.yml"),
  "utf8",
);
const publication = readFileSync(
  path.join(root, ".github/workflows/publication.yml"),
  "utf8",
);

test("the advisory workflow has the approved schedules, manual inputs, and serialized state writer", () => {
  assert.match(workflow, /cron: "0 6 \* \* 1"/);
  assert.match(workflow, /cron: "0 7 \* \* 1"/);
  assert.match(
    workflow,
    /LIGHTHOUSE_SCHEDULE: \$\{\{ github\.event\.schedule \}\}/,
  );
  assert.match(
    workflow,
    /scheduledDevices\(new Date\(\), process\.env\.LIGHTHOUSE_SCHEDULE\)/,
  );
  assert.match(workflow, /route:\n\s+description: Reader-facing route/);
  assert.match(workflow, /options: \[mobile, desktop\]/);
  assert.match(workflow, /!src\/lib\/crux-field-data\.mjs/);
  assert.match(workflow, /!src\/lib\/lighthouse-monitoring\.mjs/);
  assert.match(workflow, /group: lighthouse-state/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /permissions:\n\s+contents: read/);
  assert.doesNotMatch(workflow, /issues: write/);
  assert.match(workflow, /LIGHTHOUSE_ROUTE: \$\{\{ inputs\.route \}\}/);
  assert.match(workflow, /--route "\$LIGHTHOUSE_ROUTE"/);
  assert.doesNotMatch(workflow, /--route "\$\{\{ inputs\.route \}\}"/);
});

test("pull-request revisions are built and measured on one runner", () => {
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.match(workflow, /LIGHTHOUSE_BASE_URL: http:\/\/127\.0\.0\.1:4322/);
  assert.match(workflow, /LIGHTHOUSE_HEAD_URL: http:\/\/127\.0\.0\.1:4321/);
  assert.match(workflow, /LIGHTHOUSE_INCLUDE_SCHEDULED: "true"/);
  assert.match(workflow, /npm run lighthouse -- --trigger pull-request/);
});

test("raw evidence is retained for 90 days and state uses the checkpoint boundary", () => {
  assert.match(workflow, /retention-days: 90/);
  assert.match(workflow, /checkpoint-generated-state\.mjs lighthouse/);
  assert.match(
    workflow,
    /if: \$\{\{ !cancelled\(\) && github\.event_name != 'pull_request'/,
  );
  assert.doesNotMatch(workflow, /git push|GIT_SSH_COMMAND/);
});

test("post-publication monitoring is downstream and cannot alter publication success", () => {
  assert.match(workflow, /workflow_run:\n\s+workflows: \[Publication\]/);
  assert.match(workflow, /--trigger post-publication/);
  assert.match(
    workflow,
    /PUBLICATION_HEAD_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/,
  );
  assert.match(
    workflow,
    /PUBLICATION_RUN_STARTED_AT: \$\{\{ github\.event\.workflow_run\.run_started_at \}\}/,
  );
  assert.doesNotMatch(publication, /lighthouse|performance monitoring/iu);
});
