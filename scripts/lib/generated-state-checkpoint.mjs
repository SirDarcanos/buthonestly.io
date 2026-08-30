import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PROFILES = Object.freeze({
  lighthouse: {
    paths: ["data/lighthouse-state.json"],
    commitMessage: "chore: record Lighthouse monitoring state [skip ci]",
    invalidatingPaths: [],
  },
  publication: {
    paths: ["data/publication-state.json"],
    commitMessage: "chore: record publication state [skip ci]",
    invalidatingPaths: [],
  },
  related: {
    paths: ["data/embeddings.json", "data/related.json"],
    commitMessage: "chore: rebuild related essays",
    invalidatingPaths: [
      ".github/workflows/related.yml",
      "package.json",
      "package-lock.json",
      "scripts/build-related.mjs",
      "src/content/essays",
      "src/lib/essay-inventory.mjs",
      "src/lib/related-essays.mjs",
    ],
  },
});

const runGit = async (repositoryRoot, args, options = {}) => {
  const environment = { ...process.env, ...options.env };
  delete environment.REPOSITORY_DEPLOY_KEY;
  const { stdout = "" } = await execFileAsync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
    env: environment,
  });
  return stdout.trim();
};

const errorText = (error) => `${error?.message ?? ""}\n${error?.stderr ?? ""}`;

const authenticationFailure = (error) =>
  /Permission denied \(publickey\)|Host key verification failed|Authentication failed|repository not found|Could not read from remote repository/iu.test(
    errorText(error),
  );

const transportFailure = (error) =>
  /Could not resolve host(?:name)?|Connection (?:timed out|reset|closed)|Operation timed out|kex_exchange_identification|remote end hung up|RPC failed|Failed to connect|requested URL returned error: 5\d\d/iu.test(
    errorText(error),
  );

const pushRace = (error) =>
  /\(fetch first\)|non-fast-forward|stale info|failed to update ref/iu.test(
    errorText(error),
  );

const abortRebase = async (repositoryRoot) => {
  await runGit(repositoryRoot, ["rebase", "--abort"]).catch(() => {});
};

const isAncestor = async (repositoryRoot, ancestor, descendant) => {
  try {
    await runGit(repositoryRoot, [
      "merge-base",
      "--is-ancestor",
      ancestor,
      descendant,
    ]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
};

const shellQuote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;

export async function createGitHubCheckpointRemote({
  repository,
  deployKey,
  runnerTemp,
  knownHostsPath,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? "")) {
    throw new Error("GITHUB_REPOSITORY must name one owner/repository");
  }
  if (!deployKey?.trim()) {
    throw new Error(
      "REPOSITORY_DEPLOY_KEY is required when generated state changed",
    );
  }
  if (!runnerTemp) {
    throw new Error("RUNNER_TEMP is required when generated state changed");
  }
  const knownHosts = await readFile(knownHostsPath, "utf8");
  if (!knownHosts.trim()) {
    throw new Error("GitHub known-hosts file must not be empty");
  }

  const credentialsDirectory = await mkdtemp(
    path.join(runnerTemp, "generated-state-checkpoint-"),
  );
  const identityPath = path.join(credentialsDirectory, "deploy-key");
  try {
    await writeFile(identityPath, `${deployKey.trimEnd()}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    await rm(credentialsDirectory, { recursive: true, force: true });
    throw error;
  }
  let closed = false;

  return {
    url: `git@github.com:${repository}.git`,
    env: {
      GIT_TERMINAL_PROMPT: "0",
      GIT_SSH_COMMAND: [
        "ssh",
        "-i",
        shellQuote(identityPath),
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        `UserKnownHostsFile=${shellQuote(knownHostsPath)}`,
      ].join(" "),
    },
    async close() {
      if (closed) return;
      closed = true;
      await rm(credentialsDirectory, { recursive: true, force: true });
    },
  };
}

const validateStagedPaths = async (repositoryRoot, profile, paths) => {
  const allowedPaths = new Set(profile.paths);
  const unexpected = paths.filter((candidate) => !allowedPaths.has(candidate));
  if (unexpected.length > 0) {
    throw new Error(
      `Generated-state checkpoint staged paths outside its profile: ${unexpected.join(", ")}`,
    );
  }

  const changes = await runGit(repositoryRoot, [
    "diff",
    "--cached",
    "--name-status",
    "--no-renames",
  ]);
  for (const change of changes.split("\n").filter(Boolean)) {
    const [status, filename] = change.split("\t");
    if (!["A", "M"].includes(status)) {
      throw new Error(
        `Generated-state checkpoint only permits added or modified files: ${filename} is ${status}`,
      );
    }
  }

  for (const filename of paths) {
    const entry = await runGit(repositoryRoot, [
      "ls-files",
      "--stage",
      "--",
      filename,
    ]);
    const mode = entry.split(/\s/u, 1)[0];
    if (mode !== "100644") {
      throw new Error(
        `Generated-state checkpoint only permits regular non-executable files: ${filename} has mode ${mode || "unknown"}`,
      );
    }
    try {
      JSON.parse(await readFile(path.join(repositoryRoot, filename), "utf8"));
    } catch {
      throw new Error(
        `Generated-state checkpoint file must contain valid JSON: ${filename}`,
      );
    }
  }
};

export async function checkpointGeneratedState({
  profileName,
  repositoryRoot = process.cwd(),
  openRemote,
  log = console.log,
}) {
  const profile = PROFILES[profileName];
  if (!profile) {
    throw new Error(
      `Unknown generated-state checkpoint profile "${profileName}". Use lighthouse, publication, or related.`,
    );
  }

  const stagedBefore = await runGit(repositoryRoot, [
    "diff",
    "--cached",
    "--name-only",
  ]);
  if (stagedBefore) {
    throw new Error(
      `Generated-state checkpoint requires an empty index; already staged: ${stagedBefore.split("\n").join(", ")}`,
    );
  }

  await runGit(repositoryRoot, ["add", "--", ...profile.paths]);
  const paths = (
    await runGit(repositoryRoot, ["diff", "--cached", "--name-only"])
  )
    .split("\n")
    .filter(Boolean);

  if (paths.length === 0) {
    log(`${profileName}: generated state unchanged.`);
    return { changed: false, paths: [] };
  }

  try {
    await validateStagedPaths(repositoryRoot, profile, paths);
    if (typeof openRemote !== "function") {
      throw new Error("Generated-state checkpoint requires a remote adapter");
    }
  } catch (error) {
    await runGit(repositoryRoot, ["reset", "--quiet", "HEAD", "--", ...paths]);
    throw error;
  }

  const baseline = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
  let remote;
  try {
    remote = await openRemote();
  } catch (error) {
    await runGit(repositoryRoot, ["reset", "--quiet", "HEAD", "--", ...paths]);
    throw error;
  }
  try {
    try {
      await runGit(repositoryRoot, [
        "-c",
        "user.name=github-actions[bot]",
        "-c",
        "user.email=github-actions[bot]@users.noreply.github.com",
        "commit",
        "-m",
        profile.commitMessage,
      ]);
    } catch (error) {
      await runGit(repositoryRoot, [
        "reset",
        "--quiet",
        "HEAD",
        "--",
        ...paths,
      ]);
      throw error;
    }
    const commitSha = await runGit(repositoryRoot, ["rev-parse", "HEAD"]);
    log(`${profileName}: staged ${paths.join(", ")}`);
    log(`${profileName}: baseline ${baseline}; checkpoint ${commitSha}`);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      log(`${profileName}: push attempt ${attempt} of 3`);
      try {
        await runGit(
          repositoryRoot,
          ["fetch", "--no-tags", remote.url, "main"],
          { env: remote.env },
        );
      } catch (error) {
        if (
          authenticationFailure(error) ||
          !transportFailure(error) ||
          attempt === 3
        ) {
          throw error;
        }
        continue;
      }

      const remoteHead = await runGit(repositoryRoot, [
        "rev-parse",
        "FETCH_HEAD",
      ]);
      if (remoteHead !== baseline) {
        if (!(await isAncestor(repositoryRoot, baseline, remoteHead))) {
          throw new Error(
            `${profileName}: upstream main is not a descendant of baseline ${baseline}`,
          );
        }
        if (profile.invalidatingPaths.length > 0) {
          const invalidatingChanges = await runGit(repositoryRoot, [
            "diff",
            "--name-only",
            baseline,
            remoteHead,
            "--",
            ...profile.invalidatingPaths,
          ]);
          if (invalidatingChanges) {
            throw new Error(
              `${profileName}: relevant upstream changes require regeneration: ${invalidatingChanges.split("\n").join(", ")}`,
            );
          }
        }
        try {
          await runGit(repositoryRoot, ["rebase", "FETCH_HEAD"]);
        } catch (error) {
          await abortRebase(repositoryRoot);
          throw new Error(
            `${profileName}: checkpoint conflicts with upstream generated state; rebase was aborted`,
            { cause: error },
          );
        }
      }

      try {
        await runGit(
          repositoryRoot,
          ["push", "--no-verify", remote.url, "HEAD:main"],
          {
            env: remote.env,
          },
        );
        const pushedCommitSha = await runGit(repositoryRoot, [
          "rev-parse",
          "HEAD",
        ]);
        log(`${profileName}: pushed ${pushedCommitSha}`);
        return { changed: true, paths, commitSha: pushedCommitSha };
      } catch (error) {
        if (
          authenticationFailure(error) ||
          (!transportFailure(error) && !pushRace(error)) ||
          attempt === 3
        ) {
          throw error;
        }
      }
    }
    throw new Error(`${profileName}: checkpoint failed after three attempts`);
  } finally {
    await abortRebase(repositoryRoot);
    await remote.close();
  }
}
