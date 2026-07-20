<%*
// Requires the Templater community plugin. Prompts for a title, slugifies it,
// moves the note to drafts/<slug>.md, and fills the frontmatter + timestamp.
// Set this as Templater's "new file" template, or trigger it via a hotkey.
const title = await tp.system.prompt("Essay title");
const slug = title
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
await tp.file.move(`drafts/${slug}/${slug}`);
const now = tp.date.now("YYYY-MM-DD[T]HH:mm:ss");

// Narration style/pace: pick from the presets in scripts/lib/gemini-tts.mjs.
// Keep these lists in sync with STYLE_PRESETS / PACE_PRESETS there — an unknown
// value fails `npm run audio`, it does not fail the site build. Escape (or pick
// the first entry) to leave the field blank and take the script's default.
const styles = ["reflective", "witty", "casual", "journalistic", "literary", "warm", "technical"];
const paces = ["conversational", "slow", "measured", "brisk"];
const label = (dflt) => (v) => (v === "" ? `(default — ${dflt})` : v);
const audioStyle =
  (await tp.system.suggester(label("reflective"), ["", ...styles], false, "Narration style")) ?? "";
const audioPace =
  (await tp.system.suggester(label("conversational"), ["", ...paces], false, "Narration pace")) ?? "";
-%>
---
title: <% title %>
date: <% now %>
updated:
sticky: false
cornerstone: false
excerpt:
categories:
tags:
cover:
coverAlt:
coverCaption:
downloads:
audioVoice: Enceladus
audioStyle: <% audioStyle %>
audioPace: <% audioPace %>
---

> [!summary]- Quick Summary
>
> -
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.


