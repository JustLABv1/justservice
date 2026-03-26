import { getBackendApiUrl } from "@/app/api/_lib/backend-url"

type RouteContext = {
  params: Promise<{
    path: string[]
  }>
}

async function proxy(request: Request, context: RouteContext) {
  const { path } = await context.params
  const upstreamUrl = new URL(`/api/${path.join("/")}`, getBackendApiUrl())
  upstreamUrl.search = new URL(request.url).search

  const headers = new Headers(request.headers)
  headers.delete("host")

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer()
    init.duplex = "half"
  }

  const upstream = await fetch(upstreamUrl, init)
  const responseHeaders = new Headers(upstream.headers)

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

export const dynamic = "force-dynamic"

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const OPTIONS = proxy
export const HEAD = proxy
