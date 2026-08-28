#!/usr/bin/env node

import { createInterface } from "node:readline/promises";

import {
  createCloudflareNarrationAdapter,
  createFfmpegAdapter,
  createVertexTtsAdapter,
  narrationPaces,
  narrationStyles,
} from "../src/lib/narration-adapters.mjs";
import { createGoogleAuthenticationAdapter } from "../src/lib/google-authentication.mjs";
import {
  NARRATION_DEFAULTS,
  runNarrationCommand,
} from "../src/lib/narration-tool.mjs";

const usage = `Usage: npm run narration -- <command> <Essay slug|path> [options]

Run stages in order: prepare -> review script -> synthesize -> listen -> upload.
Clean is local-only and may run after synthesis or upload.

Commands:
  prepare, prep       Write or preserve an editable narration script; no network
  synthesize, synth   Resume synthesis and generate a verified local MP3
  upload              Upload to R2, purge the exact URL, verify, update metadata
  clean               Remove the local MP3 and checkpoint state; preserve script

Preparation options:
  --refresh           Replace an existing script and discard its narration edits

Synthesis options:
  --yes               Skip the paid-synthesis prompt
  --voice <name>      Voice (default: ${NARRATION_DEFAULTS.voice})
  --style <preset>    ${narrationStyles.join(", ")} (default: ${NARRATION_DEFAULTS.style})
  --pace <preset>     ${narrationPaces.join(", ")} (default: ${NARRATION_DEFAULTS.pace})
  --model <id>        Pinned Vertex model (default: ${NARRATION_DEFAULTS.model})
  --region <region>   Vertex region (default: ${NARRATION_DEFAULTS.region})
  --chunk-words <n>   Script chunk budget (default: ${NARRATION_DEFAULTS.chunkWords})
  --join-silence-ms <n>  Silence between chunks (default: ${NARRATION_DEFAULTS.joinSilenceMs})

Upload options:
  --yes               Skip the prompt when replacing a different audio filename

Prompts require typing "yes". Synthesis requires ffmpeg and Google Application
Default Credentials. Run 'gcloud auth application-default login' for local ADC,
or set GOOGLE_APPLICATION_CREDENTIALS to a supported credential file. Set
GOOGLE_CLOUD_PROJECT when ADC does not identify its billing project.

Upload requires CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID,
CLOUDFLARE_ZONE_ID, and NARRATION_R2_BUCKET. The token needs R2 write and
Zone Cache Purge permissions. Upload and clean never delete remote audio.`;

const valueOptions = new Map([
  ["--voice", "voice"],
  ["--style", "style"],
  ["--pace", "pace"],
  ["--model", "model"],
  ["--region", "region"],
  ["--chunk-words", "chunkWords"],
  ["--join-silence-ms", "joinSilenceMs"],
]);

const parseArguments = (args) => {
  const positional = [];
  const options = { settings: {} };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--refresh") options.refresh = true;
    else if (argument === "--yes") options.yes = true;
    else if (valueOptions.has(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value`);
      }
      options.settings[valueOptions.get(argument)] = value;
      index += 1;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      positional.push(argument);
    }
  }

  if (positional.length !== 2) throw new Error(usage);
  return {
    command: positional[0],
    target: positional[1],
    ...options,
  };
};

const confirmPaidOperation = async (message) => {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await prompt.question(`${message} Type yes to continue: `);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    prompt.close();
  }
};

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
  process.exit(0);
}

try {
  const options = parseArguments(args);
  if (["synthesize", "synth"].includes(options.command)) {
    options.provider = createVertexTtsAdapter({
      auth: createGoogleAuthenticationAdapter(),
    });
    options.audio = createFfmpegAdapter();
    options.confirm = confirmPaidOperation;
  } else if (options.command === "upload") {
    options.remote = createCloudflareNarrationAdapter();
    options.confirm = confirmPaidOperation;
  }
  await runNarrationCommand(options);
} catch (error) {
  console.error(`Narration failed: ${error.message}`);
  process.exitCode = 1;
}
