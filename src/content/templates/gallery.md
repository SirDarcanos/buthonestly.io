<%*
// Insert an image gallery (grid). Pick a column count, then add images one by
// one — leave the file blank to finish. Produces a <div class="gallery cols-N">
// that the site renders as a grid (see .gallery in global.css).
const cols = await tp.system.suggester(
["2 columns", "3 columns"],
["cols-2", "cols-3"],
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
imgs.push(`  <img src="${file}" alt="${alt.replace(/"/g, "&quot;")}" />`);
}
if (imgs.length) out = `<div class="gallery ${cols}">\n${imgs.join("\n")}\n</div>`;
}
tR += out;
-%>
