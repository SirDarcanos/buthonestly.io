# Downloads (Cloudflare R2)

Downloadable files are served from a Cloudflare R2 bucket at `/downloads/<file>`
by `functions/downloads/[[path]].js` (bucket bound as `DOWNLOADS`).

## Adding a download

```sh
npx wrangler r2 object put <bucket>/<key> --file <path> --remote
```
