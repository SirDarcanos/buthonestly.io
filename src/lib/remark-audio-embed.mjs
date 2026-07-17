// Rewrite Obsidian audio embeds `![[name.mp3]]` → an <audio> player served from
// R2 at <STATIC_BASE>/audio/<name> (AudioPlayer enhances it). MUST run before
// remark-wiki-links, which would otherwise eat the `[[...]]` and break it.
import { STATIC_BASE } from "./cdn.mjs";

const EMBED = /!\[\[([^\]|]+?\.(?:mp3|m4a|ogg|wav))(?:\|[^\]]*)?\]\]/gi;

export default function remarkAudioEmbed() {
  return (tree) => visit(tree);
}

function visit(node) {
  if (!node.children) return;
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    if (child.type === "code" || child.type === "inlineCode") continue;

    if (child.type === "text" && child.value.includes("![[")) {
      EMBED.lastIndex = 0;
      const parts = [];
      let last = 0;
      let m;
      while ((m = EMBED.exec(child.value))) {
        if (m.index > last) {
          parts.push({ type: "text", value: child.value.slice(last, m.index) });
        }
        // Basename only — the file is served flat under <STATIC_BASE>/audio/.
        const file = m[1].trim().split("/").pop();
        parts.push({
          type: "html",
          value: `<audio class="audio-enhance" src="${STATIC_BASE}/audio/${file}" data-audio-label="Listen instead of reading"></audio>`,
        });
        last = m.index + m[0].length;
      }
      if (parts.length) {
        if (last < child.value.length) {
          parts.push({ type: "text", value: child.value.slice(last) });
        }
        node.children.splice(i, 1, ...parts);
        i += parts.length - 1;
      }
    } else {
      visit(child);
    }
  }
}
