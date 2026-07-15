<%*
// Insert a single image. Prompts for the file (colocated filename or URL),
// alt text, and an optional caption/credit. Produces ![alt](file "caption").
const file = (await tp.system.prompt("Image file or URL", "")) || "";
const alt = (await tp.system.prompt("Alt text (describe the image)", "")) || "";
const caption = (await tp.system.prompt("Caption / credit (optional)", "")) || "";
tR += `![${alt}](${file}${caption ? ` "${caption}"` : ""})`;
-%>
