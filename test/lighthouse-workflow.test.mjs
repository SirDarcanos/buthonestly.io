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
  assert.match(workflow, /group: lighthouse-state/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /permissions:\n\s+actions: read\n\s+contents: read/);
  assert.doesNotMatch(workflow, /issues: write/);
  assert.match(workflow, /LIGHTHOUSE_ROUTE: \$\{\{ inputs\.route \}\}/);
  assert.match(workflow, /--route "\$LIGHTHOUSE_ROUTE"/);
  assert.doesNotMatch(workflow, /--route "\$\{\{ inputs\.route \}\}"/);
});

test("pull-request revisions are built and measured on one runner", () => {
  assert.match(workflow, /pull_request:\s*$/m);
  assert.doesNotMatch(workflow, /pull_request:\n\s+paths:/);
  assert.match(workflow, /Plan pull-request routes/);
  assert.match(
    workflow,
    /steps\.pull_request_plan\.outputs\.selected == 'true'/,
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.match(workflow, /LIGHTHOUSE_BASE_URL: http:\/\/127\.0\.0\.1:4322/);
  assert.match(workflow, /LIGHTHOUSE_HEAD_URL: http:\/\/127\.0\.0\.1:4321/);
  assert.match(
    workflow,
    /LIGHTHOUSE_PREVIEW_SLUGS: \$\{\{ steps\.pull_request_plan\.outputs\.preview_slugs \}\}/,
  );
  assert.match(
    workflow,
    /grep -q LIGHTHOUSE_PREVIEW_SLUGS src\/lib\/essays\.ts[\s\S]*LIGHTHOUSE_INCLUDE_SCHEDULED=true npm run build/,
  );
  assert.match(
    workflow,
    /LIGHTHOUSE_PULL_REQUEST_ROUTES: \$\{\{ steps\.pull_request_plan\.outputs\.routes \}\}/,
  );
  assert.match(workflow, /npm run lighthouse -- --trigger pull-request/);
});

test("scheduled reruns retain one durable observation identity", () => {
  assert.match(
    workflow,
    /LIGHTHOUSE_SCHEDULED_RUN_ID: \$\{\{ github\.run_id \}\}/,
  );
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

test("post-publication monitoring receives an exact asynchronous handoff", () => {
  assert.match(workflow, /workflow_run:\n\s+workflows: \[Publication\]/);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/,
  );
  assert.match(workflow, /name: publication-monitoring-handoff/);
  assert.match(workflow, /run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(
    workflow,
    /PUBLICATION_MONITORING_HANDOFF_FILE: artifacts\/publication-monitoring-handoff\.json/,
  );
  assert.match(workflow, /--trigger post-publication/);
  assert.match(
    workflow,
    /PUBLICATION_HEAD_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/,
  );
  assert.match(
    workflow,
    /PUBLICATION_RUN_STARTED_AT: \$\{\{ github\.event\.workflow_run\.run_started_at \}\}/,
  );
  assert.match(
    publication,
    /PUBLICATION_MONITORING_HANDOFF_FILE: artifacts\/publication-monitoring-handoff\.json/g,
  );
  assert.match(
    publication,
    /if: always\(\)\n\s+continue-on-error: true\n\s+uses: actions\/upload-artifact@v7[\s\S]*name: publication-monitoring-handoff/,
  );
});

test("every monitoring terminal outcome remains outside the publication boundary", () => {
  assert.match(workflow, /types: \[completed\]/);
  assert.doesNotMatch(workflow, /workflow_run\.conclusion/);
  assert.match(workflow, /timeout-minutes: 45/);
  assert.match(workflow, /checkpoint-generated-state\.mjs lighthouse/);
  assert.doesNotMatch(publication, /run-lighthouse|--trigger post-publication/);
  assert.doesNotMatch(publication, /workflow_run|lighthouse-state/);
});
