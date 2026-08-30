import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkpointGeneratedState,
  createGitHubCheckpointRemote,
} from "../scripts/lib/generated-state-checkpoint.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

const git = (cwd, ...args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const createRepository = (testContext) => {
  const root = mkdtempSync(path.join(tmpdir(), "checkpoint-repository-"));
  testContext.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "Test Author");
  git(root, "config", "user.email", "test@example.com");
  return root;
};

const commitFile = (root, filename, content) => {
  const filePath = path.join(root, filename);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
  git(root, "add", "--", filename);
  git(root, "commit", "-m", `add ${filename}`);
};

const createRemote = (testContext, root) => {
  const remote = mkdtempSync(path.join(tmpdir(), "checkpoint-remote-"));
  testContext.after(() => rmSync(remote, { recursive: true, force: true }));
  git(remote, "init", "--bare", "--initial-branch=main");
  git(root, "push", remote, "main:main");
  return remote;
};

const localRemote = (remote) => async () => ({
  url: remote,
  env: {},
  close: async () => {},
});

test("workflows delegate every generated-state push to the checkpoint command", () => {
  const publication = readFileSync(
    path.join(repositoryRoot, ".github/workflows/publication.yml"),
    "utf8",
  );
  const related = readFileSync(
    path.join(repositoryRoot, ".github/workflows/related.yml"),
    "utf8",
  );
  const lighthouse = readFileSync(
    path.join(repositoryRoot, ".github/workflows/lighthouse.yml"),
    "utf8",
  );

  assert.equal(
    publication.match(
      /node scripts\/checkpoint-generated-state\.mjs publication/gu,
    )?.length,
    2,
  );
  assert.equal(
    related.match(/node scripts\/checkpoint-generated-state\.mjs related/gu)
      ?.length,
    1,
  );
  assert.equal(
    lighthouse.match(
      /node scripts\/checkpoint-generated-state\.mjs lighthouse/gu,
    )?.length,
    1,
  );
  assert.match(related, /src\/lib\/essay-inventory\.mjs/);
  for (const workflow of [publication, related, lighthouse]) {
    assert.doesNotMatch(
      workflow,
      /GIT_SSH_COMMAND|git push|git pull --rebase/u,
    );
  }
});

test("the pinned GitHub host keys match GitHub's published fingerprints", () => {
  const output = execFileSync(
    "ssh-keygen",
    ["-lf", path.join(repositoryRoot, ".github/github-known-hosts")],
    { encoding: "utf8" },
  );

  for (const fingerprint of [
    "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU",
    "SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM",
    "SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s",
  ]) {
    assert.ok(output.includes(fingerprint), fingerprint);
  }
});

test("the GitHub remote pins host identity and removes its deploy key", async (testContext) => {
  const runnerTemp = mkdtempSync(
    path.join(tmpdir(), "checkpoint-credentials-"),
  );
  testContext.after(() => rmSync(runnerTemp, { recursive: true, force: true }));
  const knownHostsPath = path.join(runnerTemp, "github-known-hosts");
  writeFileSync(knownHostsPath, "github.com ssh-ed25519 test-key\n");

  const remote = await createGitHubCheckpointRemote({
    repository: "owner/repository",
    deployKey: "private-key-material",
    runnerTemp,
    knownHostsPath,
  });
  const identityMatch = remote.env.GIT_SSH_COMMAND.match(/-i '([^']+)'/u);

  assert.equal(remote.url, "git@github.com:owner/repository.git");
  assert.match(remote.env.GIT_SSH_COMMAND, /StrictHostKeyChecking=yes/);
  assert.match(remote.env.GIT_SSH_COMMAND, /UserKnownHostsFile=/);
  assert.ok(identityMatch);
  assert.equal(statSync(identityMatch[1]).mode & 0o777, 0o600);
  assert.equal(
    readFileSync(identityMatch[1], "utf8"),
    "private-key-material\n",
  );
  assert.doesNotMatch(remote.env.GIT_SSH_COMMAND, /private-key-material/);

  await remote.close();
  assert.equal(existsSync(identityMatch[1]), false);
});

test("a no-op checkpoint does not open the privileged remote", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  let remoteOpened = false;

  const result = await checkpointGeneratedState({
    profileName: "publication",
    repositoryRoot: root,
    openRemote: async () => {
      remoteOpened = true;
      throw new Error("remote should stay closed");
    },
    log: () => {},
  });

  assert.deepEqual(result, { changed: false, paths: [] });
  assert.equal(remoteOpened, false);
  assert.equal(
    readFileSync(path.join(root, "data/publication-state.json"), "utf8"),
    "{}\n",
  );
});

test("a checkpoint restores the index when credentials cannot open the remote", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"changed":true}\n',
  );

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "publication",
      repositoryRoot: root,
      openRemote: async () => {
        throw new Error("missing credentials");
      },
      log: () => {},
    }),
    /missing credentials/,
  );
  assert.equal(git(root, "diff", "--cached", "--name-only"), "");
  assert.equal(git(root, "status", "--short"), "M data/publication-state.json");
});

test("a checkpoint rejects an index that already contains staged work", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  writeFileSync(path.join(root, "unexpected.txt"), "staged elsewhere\n");
  git(root, "add", "unexpected.txt");

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "publication",
      repositoryRoot: root,
      openRemote: async () => {
        throw new Error("remote should stay closed");
      },
      log: () => {},
    }),
    /requires an empty index; already staged: unexpected\.txt/,
  );
});

test("a checkpoint rejects malformed generated state", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  writeFileSync(path.join(root, "data/publication-state.json"), "not json\n");

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "publication",
      repositoryRoot: root,
      openRemote: async () => {
        throw new Error("remote should stay closed");
      },
      log: () => {},
    }),
    /must contain valid JSON/,
  );
  assert.equal(git(root, "diff", "--cached", "--name-only"), "");
});

test("a checkpoint rejects deletion and restores an empty index", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  rmSync(path.join(root, "data/publication-state.json"));

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "publication",
      repositoryRoot: root,
      openRemote: async () => {
        throw new Error("remote should stay closed");
      },
      log: () => {},
    }),
    /only permits added or modified files/,
  );
  assert.equal(git(root, "diff", "--cached", "--name-only"), "");
  assert.equal(git(root, "status", "--short"), "D data/publication-state.json");
});

test("a checkpoint rejects a generated-state symlink", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  rmSync(path.join(root, "data/publication-state.json"));
  symlinkSync("../target.json", path.join(root, "data/publication-state.json"));

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "publication",
      repositoryRoot: root,
      openRemote: async () => {
        throw new Error("remote should stay closed");
      },
      log: () => {},
    }),
    /only permits (?:added or modified|regular non-executable) files/,
  );
});

test("a related checkpoint rejects stale output after inventory changes", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/embeddings.json", "{}\n");
  commitFile(root, "data/related.json", "{}\n");
  commitFile(
    root,
    "src/lib/essay-inventory.mjs",
    "export const version = 1;\n",
  );
  const remote = createRemote(testContext, root);
  const updater = mkdtempSync(path.join(tmpdir(), "checkpoint-updater-"));
  testContext.after(() => rmSync(updater, { recursive: true, force: true }));
  git(updater, "clone", remote, ".");
  git(updater, "config", "user.name", "Concurrent Author");
  git(updater, "config", "user.email", "concurrent@example.com");
  commitFile(
    updater,
    "src/lib/essay-inventory.mjs",
    "export const version = 2;\n",
  );
  git(updater, "push", "origin", "main");
  writeFileSync(path.join(root, "data/related.json"), '{"new-essay":[]}\n');

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "related",
      repositoryRoot: root,
      openRemote: localRemote(remote),
      log: () => {},
    }),
    /relevant upstream changes.*src\/lib\/essay-inventory\.mjs/,
  );
  assert.equal(
    git(remote, "--git-dir", remote, "show", "main:data/related.json"),
    "{}",
  );
});

test("a publication checkpoint rebases across unrelated upstream work", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  const remote = createRemote(testContext, root);
  const updater = mkdtempSync(path.join(tmpdir(), "checkpoint-fast-forward-"));
  testContext.after(() => rmSync(updater, { recursive: true, force: true }));
  git(updater, "clone", remote, ".");
  git(updater, "config", "user.name", "Concurrent Author");
  git(updater, "config", "user.email", "concurrent@example.com");
  commitFile(updater, "unrelated.txt", "concurrent change\n");
  git(updater, "push", "origin", "main");
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"local":true}\n',
  );

  const result = await checkpointGeneratedState({
    profileName: "publication",
    repositoryRoot: root,
    openRemote: localRemote(remote),
    log: () => {},
  });

  assert.equal(result.changed, true);
  assert.equal(
    git(remote, "--git-dir", remote, "show", "main:unrelated.txt"),
    "concurrent change",
  );
  assert.equal(
    git(
      remote,
      "--git-dir",
      remote,
      "show",
      "main:data/publication-state.json",
    ),
    '{"local":true}',
  );
});

test("a checkpoint rejects rewritten upstream history", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  const remote = createRemote(testContext, root);
  const updater = mkdtempSync(path.join(tmpdir(), "checkpoint-rewrite-"));
  testContext.after(() => rmSync(updater, { recursive: true, force: true }));
  git(updater, "clone", remote, ".");
  git(updater, "config", "user.name", "History Rewriter");
  git(updater, "config", "user.email", "rewrite@example.com");
  git(updater, "checkout", "--orphan", "replacement");
  git(updater, "rm", "-rf", ".");
  commitFile(updater, "data/publication-state.json", '{"replacement":true}\n');
  git(updater, "push", "--force", "origin", "HEAD:main");
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"local":true}\n',
  );

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "publication",
      repositoryRoot: root,
      openRemote: localRemote(remote),
      log: () => {},
    }),
    /upstream main is not a descendant of baseline/,
  );
});

test("a checkpoint aborts an upstream state conflict cleanly", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  const remote = createRemote(testContext, root);
  const updater = mkdtempSync(path.join(tmpdir(), "checkpoint-conflict-"));
  testContext.after(() => rmSync(updater, { recursive: true, force: true }));
  git(updater, "clone", remote, ".");
  git(updater, "config", "user.name", "Concurrent Author");
  git(updater, "config", "user.email", "concurrent@example.com");
  commitFile(updater, "data/publication-state.json", '{"remote":true}\n');
  git(updater, "push", "origin", "main");
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"local":true}\n',
  );

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "publication",
      repositoryRoot: root,
      openRemote: localRemote(remote),
      log: () => {},
    }),
    /conflicts with upstream generated state; rebase was aborted/,
  );
  assert.equal(git(root, "status", "--short"), "");
  assert.equal(
    git(
      remote,
      "--git-dir",
      remote,
      "show",
      "main:data/publication-state.json",
    ),
    '{"remote":true}',
  );
});

test("a rejected commit restores generated state to the working tree", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  const remote = createRemote(testContext, root);
  const hookPath = path.join(root, ".git", "hooks", "pre-commit");
  writeFileSync(hookPath, "#!/bin/sh\nexit 1\n");
  chmodSync(hookPath, 0o755);
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"changed":true}\n',
  );

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "publication",
      repositoryRoot: root,
      openRemote: localRemote(remote),
      log: () => {},
    }),
    /git.*commit|Command failed/,
  );
  assert.equal(git(root, "diff", "--cached", "--name-only"), "");
  assert.equal(git(root, "status", "--short"), "M data/publication-state.json");
});

test("commit hooks never inherit the deploy key secret", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  const remote = createRemote(testContext, root);
  const hookPath = path.join(root, ".git", "hooks", "pre-commit");
  writeFileSync(hookPath, '#!/bin/sh\n[ -z "$REPOSITORY_DEPLOY_KEY" ]\n');
  chmodSync(hookPath, 0o755);
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"safe":true}\n',
  );
  const previousSecret = process.env.REPOSITORY_DEPLOY_KEY;
  process.env.REPOSITORY_DEPLOY_KEY = "must-not-reach-hooks";
  testContext.after(() => {
    if (previousSecret === undefined) delete process.env.REPOSITORY_DEPLOY_KEY;
    else process.env.REPOSITORY_DEPLOY_KEY = previousSecret;
  });

  const result = await checkpointGeneratedState({
    profileName: "publication",
    repositoryRoot: root,
    openRemote: localRemote(remote),
    log: () => {},
  });

  assert.equal(result.changed, true);
});

test("a checkpoint does not run pre-push hooks beside the deploy key", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  const remote = createRemote(testContext, root);
  const hookPath = path.join(root, ".git", "hooks", "pre-push");
  writeFileSync(hookPath, "#!/bin/sh\nexit 1\n");
  chmodSync(hookPath, 0o755);
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"safe":true}\n',
  );

  const result = await checkpointGeneratedState({
    profileName: "publication",
    repositoryRoot: root,
    openRemote: localRemote(remote),
    log: () => {},
  });

  assert.equal(result.changed, true);
});

test("a checkpoint does not retry a remote policy rejection", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  const remote = createRemote(testContext, root);
  const hookPath = path.join(remote, "hooks", "pre-receive");
  writeFileSync(hookPath, "#!/bin/sh\necho 'policy rejection' >&2\nexit 1\n");
  chmodSync(hookPath, 0o755);
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"blocked":true}\n',
  );
  const messages = [];

  await assert.rejects(
    checkpointGeneratedState({
      profileName: "publication",
      repositoryRoot: root,
      openRemote: localRemote(remote),
      log: (message) => messages.push(message),
    }),
    /pre-receive hook declined/,
  );
  assert.doesNotMatch(messages.join("\n"), /attempt 2 of 3/);
});

test("a checkpoint retries a push race rejection", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  const remote = createRemote(testContext, root);
  const hookPath = path.join(remote, "hooks", "pre-receive");
  writeFileSync(
    hookPath,
    `#!/bin/sh\nrm -- "$0"\necho 'rejected (fetch first)' >&2\nexit 1\n`,
  );
  chmodSync(hookPath, 0o755);
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"retry":true}\n',
  );
  const messages = [];

  const result = await checkpointGeneratedState({
    profileName: "publication",
    repositoryRoot: root,
    openRemote: localRemote(remote),
    log: (message) => messages.push(message),
  });

  assert.equal(result.changed, true);
  assert.match(messages.join("\n"), /attempt 2 of 3/);
  assert.equal(
    git(
      remote,
      "--git-dir",
      remote,
      "show",
      "main:data/publication-state.json",
    ),
    '{"retry":true}',
  );
});

test("a publication checkpoint commits and pushes only its generated state", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/publication-state.json", "{}\n");
  const remote = createRemote(testContext, root);
  writeFileSync(
    path.join(root, "data/publication-state.json"),
    '{"essays":{"example":{}}}\n',
  );
  writeFileSync(path.join(root, "unrelated.txt"), "leave me unstaged\n");

  const result = await checkpointGeneratedState({
    profileName: "publication",
    repositoryRoot: root,
    openRemote: localRemote(remote),
    log: () => {},
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.paths, ["data/publication-state.json"]);
  assert.equal(
    git(
      remote,
      "--git-dir",
      remote,
      "show",
      "main:data/publication-state.json",
    ),
    '{"essays":{"example":{}}}',
  );
  assert.equal(
    git(remote, "--git-dir", remote, "log", "-1", "--format=%s"),
    "chore: record publication state [skip ci]",
  );
  assert.equal(git(root, "status", "--short"), "?? unrelated.txt");
});

test("the Lighthouse checkpoint profile permits only its deterministic state document", async (testContext) => {
  const root = createRepository(testContext);
  commitFile(root, "data/lighthouse-state.json", '{"version":1}\n');
  const remote = createRemote(testContext, root);
  writeFileSync(
    root + "/data/lighthouse-state.json",
    '{"version":1,"changed":true}\n',
  );

  const result = await checkpointGeneratedState({
    profileName: "lighthouse",
    repositoryRoot: root,
    openRemote: localRemote(remote),
    log: () => {},
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.paths, ["data/lighthouse-state.json"]);
  assert.equal(
    git(root, "show", "--format=", "--name-only", "HEAD"),
    "data/lighthouse-state.json",
  );
});
