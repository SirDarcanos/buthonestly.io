// Serves /static/<file> inline from the R2 bucket bound as STATIC (used for
// assets that play/render in the page, e.g. voice samples). Unlike the
// downloads Worker, it sets no content-disposition, so files are served inline
// rather than forced as attachments.
async function handle({ params, env }, method) {
  const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!key) return new Response("Not found", { status: 404 });

  // HEAD only needs metadata, so skip streaming the body.
  const object =
    method === "HEAD" ? await env.STATIC.head(key) : await env.STATIC.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers); // Content-Type etc. from R2 metadata
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  if (method === "HEAD") headers.set("content-length", String(object.size));

  return new Response(method === "HEAD" ? null : object.body, { headers });
}

export const onRequestGet = (ctx) => handle(ctx, "GET");
export const onRequestHead = (ctx) => handle(ctx, "HEAD");
