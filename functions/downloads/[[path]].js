// Serves /downloads/<file> from the R2 bucket bound as DOWNLOADS. Setup: DOWNLOADS.md
export async function onRequestGet({ params, env }) {
  const key = Array.isArray(params.path) ? params.path.join("/") : params.path;
  if (!key) return new Response("Not found", { status: 404 });

  const object = await env.DOWNLOADS.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers); // Content-Type etc. from R2 metadata
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set(
    "content-disposition",
    `attachment; filename="${key.split("/").pop()}"`,
  );

  return new Response(object.body, { headers });
}
