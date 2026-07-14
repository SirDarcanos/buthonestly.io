# Development

When starting the dev server, use background mode:

```bash
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Styling

Style with Tailwind utility classes directly in the markup. Do not add scoped
`<style>` blocks or hand-written CSS for anything a utility can express — that
is the whole point of having Tailwind.

- Reach for a `<style>` block (or `global.css`) only for what utilities genuinely
  can't do: JS-set state that must map to classes (toggle the class in JS
  instead), keyframes, or complex selectors. Prefer a utility every time there
  is one.
- To use `@apply` (or `theme()`) inside a component/scoped `<style>`, add
  `@reference "../styles/global.css";` (or `@reference "tailwindcss";`) at the
  top of that block so Tailwind v4 has the theme context. Without it, `@apply`
  there won't resolve the project's utilities.
- Toggle visibility by adding/removing the `hidden` utility in JS, not with
  bespoke `display` CSS.

## Documentation

Full documentation: [https://docs.astro.build]

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
