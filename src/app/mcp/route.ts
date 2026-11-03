function convexMcpUrl() {
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.replace(/\/$/, "");
  if (!site) throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not set");
  return `${site}/mcp`;
}

function forwardedHeaders(request: Request) {
  const headers = new Headers();
  for (const name of ["authorization", "content-type", "mcp-protocol-version", "accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function proxyResponse(upstream: Response) {
  const headers = new Headers();
  const type = upstream.headers.get("content-type");
  if (type) headers.set("content-type", type);
  for (const name of [
    "access-control-allow-origin",
    "access-control-allow-headers",
    "access-control-allow-methods",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function POST(request: Request) {
  const upstream = await fetch(convexMcpUrl(), {
    method: "POST",
    headers: forwardedHeaders(request),
    body: await request.text(),
  });
  return proxyResponse(upstream);
}

export async function OPTIONS(request: Request) {
  const upstream = await fetch(convexMcpUrl(), {
    method: "OPTIONS",
    headers: forwardedHeaders(request),
  });
  return proxyResponse(upstream);
}
