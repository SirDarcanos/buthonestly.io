import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createCloudflareNarrationAdapter } from "../src/lib/narration-adapters.mjs";
import { runNarrationCommand } from "../src/lib/narration-tool.mjs";

const createApprovedNarration = async (context, frontmatter = "") => {
  const root = await mkdtemp(path.join(tmpdir(), "narration-upload-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "src/content/essays/fixture");
  await mkdir(directory, { recursive: true });
  const sourcePath = path.join(directory, "fixture.mdx");
  await writeFile(
    sourcePath,
    `---\ntitle: Approved Essay\nupdated: 2026-08-01\n${frontmatter}---\n\nApproved prose.`,
  );
  await runNarrationCommand({
    command: "prepare",
    target: "fixture",
    repositoryRoot: root,
    log: () => {},
  });
  await runNarrationCommand({
    command: "synthesize",
    target: "fixture",
    repositoryRoot: root,
    yes: true,
    provider: {
      preflight: async () => {},
      synthesize: async () => Buffer.from([1, 0]),
    },
    audio: {
      preflight: async () => {},
      encode: async ({ outputPath }) => writeFile(outputPath, "approved mp3"),
    },
    log: () => {},
  });
  return { root, sourcePath };
};

const successfulRemote = (calls) => ({
  async preflight({ publicUrl }) {
    calls.push(["preflight", publicUrl]);
  },
  async upload({ filePath, key }) {
    calls.push(["upload", filePath, key]);
  },
  async purge({ publicUrl }) {
    calls.push(["purge", publicUrl]);
  },
  async verify({ publicUrl, expectedHash }) {
    calls.push(["verify", publicUrl, expectedHash]);
  },
});

test("upload preflights before side effects and changes only narration metadata after public verification", async (context) => {
  const { root, sourcePath } = await createApprovedNarration(
    context,
    "custom: untouched\n",
  );
  const before = await readFile(sourcePath, "utf8");
  const calls = [];
  const messages = [];

  const result = await runNarrationCommand({
    command: "upload",
    target: "fixture",
    repositoryRoot: root,
    remote: successfulRemote(calls),
    log: (message) => messages.push(message),
  });

  assert.deepEqual(
    calls.map(([name]) => name),
    ["preflight", "upload", "purge", "verify"],
  );
  assert.equal(calls[1][2], "audio/fixture.mp3");
  assert.match(calls[3][2], /^[0-9a-f]{64}$/);
  assert.equal(
    await readFile(sourcePath, "utf8"),
    before.replace(
      "custom: untouched\n",
      "custom: untouched\naudio: fixture.mp3\n",
    ),
  );
  assert.equal(
    result.publicUrl,
    "https://static.buthonestly.io/audio/fixture.mp3",
  );
  assert.match(messages.join("\n"), /static\.buthonestly\.io.*fixture\.mp3/);
  assert.match(
    messages.join("\n"),
    new RegExp(sourcePath.replaceAll("/", "\\/")),
  );
  assert.match(messages.join("\n"), /git add/i);
});

test("upload preserves metadata when preflight or public verification fails", async (context) => {
  const { root, sourcePath } = await createApprovedNarration(context);
  const before = await readFile(sourcePath, "utf8");
  const premature = [];

  await assert.rejects(
    runNarrationCommand({
      command: "upload",
      target: "fixture",
      repositoryRoot: root,
      remote: {
        preflight: async () => {
          throw new Error("missing Cache Purge authorization");
        },
        upload: async () => premature.push("upload"),
        purge: async () => premature.push("purge"),
        verify: async () => premature.push("verify"),
      },
      log: () => {},
    }),
    /preflight.*Cache Purge.*Recovery:/is,
  );
  assert.deepEqual(premature, []);
  assert.equal(await readFile(sourcePath, "utf8"), before);

  const calls = [];
  const remote = successfulRemote(calls);
  remote.verify = async () => {
    calls.push(["verify"]);
    throw new Error("public bytes do not match the approved MP3");
  };
  await assert.rejects(
    runNarrationCommand({
      command: "upload",
      target: "fixture",
      repositoryRoot: root,
      remote,
      log: () => {},
    }),
    /public verification.*bytes do not match.*Recovery:/is,
  );
  assert.deepEqual(
    calls.map(([name]) => name),
    ["preflight", "upload", "purge", "verify"],
  );
  assert.equal(await readFile(sourcePath, "utf8"), before);
});

test("upload refuses to overwrite concurrent Essay edits", async (context) => {
  const { root, sourcePath } = await createApprovedNarration(context);
  const calls = [];
  const remote = successfulRemote(calls);
  remote.verify = async () => {
    calls.push(["verify"]);
    const current = await readFile(sourcePath, "utf8");
    await writeFile(
      sourcePath,
      current.replace("Approved prose.", "A concurrent edit."),
    );
  };

  await assert.rejects(
    runNarrationCommand({
      command: "upload",
      target: "fixture",
      repositoryRoot: root,
      remote,
      log: () => {},
    }),
    /metadata update.*changed during upload.*Recovery:/is,
  );
  assert.match(await readFile(sourcePath, "utf8"), /A concurrent edit\./);
  assert.doesNotMatch(await readFile(sourcePath, "utf8"), /^audio:/m);
});

test("upload rejects audio metadata it cannot rewrite without touching unrelated YAML", async (context) => {
  const { root } = await createApprovedNarration(
    context,
    'audio : "legacy-recording.mp3"\n',
  );
  const calls = [];

  await assert.rejects(
    runNarrationCommand({
      command: "upload",
      target: "fixture",
      repositoryRoot: root,
      remote: successfulRemote(calls),
      log: () => {},
    }),
    /audio metadata must use the canonical `audio: filename\.mp3` form/i,
  );
  assert.deepEqual(calls, []);
});

test("replacing a different narration filename requires confirmation before upload", async (context) => {
  const { root, sourcePath } = await createApprovedNarration(
    context,
    "audio: legacy-recording.mp3\n",
  );
  const before = await readFile(sourcePath, "utf8");
  const calls = [];

  await assert.rejects(
    runNarrationCommand({
      command: "upload",
      target: "fixture",
      repositoryRoot: root,
      remote: successfulRemote(calls),
      confirm: async (message) => {
        assert.match(message, /legacy-recording\.mp3.*fixture\.mp3/i);
        return false;
      },
      log: () => {},
    }),
    /cancelled/i,
  );

  assert.deepEqual(
    calls.map(([name]) => name),
    ["preflight"],
  );
  assert.equal(await readFile(sourcePath, "utf8"), before);
});

test("the Cloudflare adapter uses pinned Wrangler upload metadata, purges the exact URL, and verifies public bytes", async () => {
  const invocations = [];
  const requests = [];
  const mp3 = Buffer.from("approved mp3");
  let probeError = "invalid URL";
  const spawnProcess = (command, args, options) => {
    invocations.push({ command, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.end = () => queueMicrotask(() => child.emit("close", 0));
    return child;
  };
  const fetchRequest = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/user/tokens/verify")) {
      return Response.json({ success: true, result: { status: "active" } });
    }
    if (String(url).endsWith("/purge_cache")) {
      const body = JSON.parse(options.body);
      if (body.files?.[0] === "narration-upload-permission-probe") {
        return Response.json(
          { success: false, errors: [{ message: probeError }] },
          { status: 400 },
        );
      }
      return Response.json({ success: true });
    }
    if (options.method === "HEAD") {
      return new Response(null, { status: 404 });
    }
    return new Response(mp3, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control":
          "public, max-age=0, must-revalidate, s-maxage=31536000",
      },
    });
  };
  const adapter = createCloudflareNarrationAdapter({
    repositoryRoot: "/repo",
    env: {
      CLOUDFLARE_API_TOKEN: "secret-token",
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      CLOUDFLARE_ZONE_ID: "zone-id",
      NARRATION_R2_BUCKET: "static-bucket",
    },
    spawnProcess,
    fetch: fetchRequest,
  });
  const publicUrl = "https://static.buthonestly.io/audio/fixture.mp3";

  await adapter.preflight({ publicUrl });
  await adapter.upload({
    filePath: "/tmp/fixture.mp3",
    key: "audio/fixture.mp3",
  });
  await adapter.purge({ publicUrl });
  await adapter.verify({
    publicUrl,
    expectedHash:
      "df7836f66c1402e21396262b80c230825e029efab65531b3d2d7a3f61ef7a02d",
  });

  assert.equal(
    invocations.every(({ command }) => command === process.execPath),
    true,
  );
  assert.match(
    invocations[0].args[0],
    /node_modules\/wrangler\/bin\/wrangler\.js$/,
  );
  assert.deepEqual(invocations[1].args.slice(1), [
    "r2",
    "bucket",
    "info",
    "static-bucket",
    "--json",
  ]);
  assert.deepEqual(invocations[2].args.slice(1), [
    "r2",
    "object",
    "put",
    "static-bucket/audio/fixture.mp3",
    "--file",
    "/tmp/fixture.mp3",
    "--content-type",
    "audio/mpeg",
    "--cache-control",
    "public, max-age=0, must-revalidate, s-maxage=31536000",
    "--remote",
  ]);
  assert.equal(
    invocations.some(({ args }) => args.join(" ").includes("secret-token")),
    false,
  );
  const purgeRequests = requests.filter(({ url }) =>
    url.endsWith("/purge_cache"),
  );
  assert.equal(purgeRequests.length, 2);
  assert.deepEqual(JSON.parse(purgeRequests[0].options.body), {
    files: ["narration-upload-permission-probe"],
  });
  const purge = purgeRequests[1];
  assert.equal(
    purge.url,
    "https://api.cloudflare.com/client/v4/zones/zone-id/purge_cache",
  );
  assert.deepEqual(JSON.parse(purge.options.body), { files: [publicUrl] });
  assert.equal(
    new Headers(purge.options.headers).get("authorization"),
    "Bearer secret-token",
  );
  const verification = requests.at(-1);
  assert.equal(verification.url, publicUrl);
  assert.equal(verification.options.redirect, "error");

  probeError = "invalid zone identifier";
  await assert.rejects(
    adapter.preflight({ publicUrl }),
    /zone and Cache Purge authorization verification failed.*invalid zone/i,
  );
});
