<%*
// Insert a fenced code block. Pick a language, then type inside the fence.
const languages = {
  php: "PHP",
  javascript: "JavaScript",
  python: "Python",
  bash: "Bash",
  json: "JSON",
  text: "Text",
};
const lang =
  (await tp.system.suggester(Object.values(languages), Object.keys(languages))) ??
  "";
-%>
```<% lang %>
<% tp.file.cursor() %>
```
