# Drafts

Work-in-progress essays live here, **outside** the `essays/` collection, so they
stay separate from published work in the Obsidian sidebar and are never built or
deployed by Astro (the collection only globs `src/content/essays/`).

## Workflow

1. Start a new essay here: `drafts/<slug>/<slug>.md` (one folder per essay, image
   colocated — same layout as published essays).
2. Write freely. Wikilinks (`[[other-essay]]`) and the graph still work across
   folders in Obsidian.
3. When it's ready to publish or schedule, move the whole `<slug>/` folder into
   `../essays/`, set `draft: false` and a `date`, and add the required `cover`,
   `coverAlt`, `categories`, and `tags` (the schema enforces these once live).

## Obsidian tip

If you'd rather keep everything in one folder instead, the **Dataview** plugin
can build a live "Drafts" dashboard from front-matter (`draft: true`) — but this
folder needs no plugin and keeps drafts out of the deployed site by construction.
