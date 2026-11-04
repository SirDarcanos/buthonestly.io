import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";

const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);

test("every 1Password CLI installation uses the latest stable release", async () => {
  const files = await readdir(workflowsDirectory);
  const installations = [];

  for (const file of files.filter((name) => /\.ya?ml$/.test(name))) {
    const workflow = parse(
      await readFile(new URL(file, workflowsDirectory), "utf8"),
    );
    for (const job of Object.values(workflow.jobs)) {
      for (const step of job.steps ?? []) {
        if (!step.uses?.startsWith("1password/install-cli-action@")) continue;
        installations.push(file);
        assert.equal(step.with?.version, "latest", file);
      }
    }
  }

  assert.ok(installations.length > 0);
});
