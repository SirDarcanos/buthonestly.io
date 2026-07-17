# Downloads & static assets (Cloudflare R2)

Both R2 buckets are served directly via R2 custom domains (no Workers):

- `https://downloads.buthonestly.io/<file>` — downloadable files (essay zips,
  CSVs). Objects carry `content-disposition: attachment` metadata so they
  download instead of rendering.
- `https://static.buthonestly.io/<file>` — inline assets (voice samples,
  essay audio narrations under `audio/`).

Base URLs live in `src/lib/cdn.mjs`. The old `/downloads/*` and `/static/*`
paths 301 to the subdomains via `public/_redirects`.

## Adding a download

```sh
npx wrangler r2 object put <bucket>/<key> --file <path> --remote \
  --cd 'attachment; filename="<key>"' --cc 'public, max-age=31536000, immutable'
```

(For static assets, drop the `--cd`.)
