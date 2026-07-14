// Serves /static/<file> inline from the R2 bucket bound as STATIC (used for
// assets that play/render in the page, e.g. voice samples). Unlike the
// downloads Worker, it sets no content-disposition, so files are served inline
// rather than forced as attachments.
export async function onRequestGet({ params, env }) {
  const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!key) return new Response("Not found", { status: 404 });

  const object = await env.STATIC.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers); // Content-Type etc. from R2 metadata
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(object.body, { headers });
}
