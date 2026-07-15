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
---

> [!summary]- Quick Summary
>
> -
>
> AI-generated summary based on the text of the article and checked by the author. [Read more](/artificial-intelligence-tools/ "BUT. Honestly Artificial Intelligence Tools") about how BUT. Honestly uses AI.


