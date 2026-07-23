<%*
// Insert an image gallery (grid). Pick a column count, then add images one by
// one — leave the file blank to finish. Produces a `> [!gallery] N` callout,
// which Obsidian previews in place and remark-gallery.mjs turns into a grid.
const cols = await tp.system.suggester(
["2 columns", "3 columns", "4 columns"],
["2", "3", "4"],
);
let out = "";
if (cols) {
const imgs = [];
let file;
while (
(file = await tp.system.prompt(
`Image ${imgs.length + 1} — file or URL (blank to finish)`,
"",
))
) {
const alt = (await tp.system.prompt("Alt text (describe the image)", "")) || "";
imgs.push(`> ![${alt.replace(/[[\]]/g, "")}](${file})`);
}
if (imgs.length) out = `> [!gallery] ${cols}\n${imgs.join("\n")}`;
}
tR += out;
-%>
