#!/usr/bin/env node

import path from "node:path";

import {
  checkpointGeneratedState,
  createGitHubCheckpointRemote,
} from "./lib/generated-state-checkpoint.mjs";

const profileName = process.argv[2];
const repositoryRoot = process.cwd();

try {
  await checkpointGeneratedState({
    profileName,
    repositoryRoot,
    openRemote: () =>
      createGitHubCheckpointRemote({
        repository: process.env.GITHUB_REPOSITORY,
        deployKey: process.env.REPOSITORY_DEPLOY_KEY,
        runnerTemp: process.env.RUNNER_TEMP,
        knownHostsPath: path.join(
          repositoryRoot,
          ".github",
          "github-known-hosts",
        ),
      }),
  });
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
