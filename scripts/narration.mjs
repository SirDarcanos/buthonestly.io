#!/usr/bin/env node

import { runNarrationCommand } from "../src/lib/narration-tool.mjs";

const usage = `Usage: npm run narration -- <prepare|prep> <Essay slug|path> [--refresh]

prepare, prep  Write an editable narration script without network calls
--refresh      Replace an existing script and discard its narration edits`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
  process.exit(0);
}

const positional = args.filter((argument) => !argument.startsWith("--"));
const unknownFlags = args.filter(
  (argument) => argument.startsWith("--") && argument !== "--refresh",
);

if (unknownFlags.length || positional.length !== 2) {
  if (unknownFlags.length) console.error(`Unknown option: ${unknownFlags[0]}`);
  console.error(usage);
  process.exit(1);
}

try {
  await runNarrationCommand({
    command: positional[0],
    target: positional[1],
    refresh: args.includes("--refresh"),
  });
} catch (error) {
  console.error(`Narration prepare failed: ${error.message}`);
  process.exitCode = 1;
}
