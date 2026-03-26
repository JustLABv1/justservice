import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getBackendApiUrl } from "@/app/api/_lib/backend-url"

const API_URL = getBackendApiUrl()
const REFRESH_COOKIE = "refresh_token"
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60

type AuthSuccess = {
  access_token: string
  refresh_token: string
  expires_in: number
}

type ErrorBody = {
  error?: string
}

export async function postAuthJson(
  path: string,
  init: {
    body?: unknown
    includeRefreshCookie?: boolean
  } = {}
): Promise<Response> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  }

  if (init.includeRefreshCookie) {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value
    if (refreshToken) {
      headers.Cookie = `${REFRESH_COOKIE}=${refreshToken}`
    }
  }

  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  })
}

export async function jsonErrorFrom(response: Response) {
  let body: ErrorBody | null = null

  try {
    body = (await response.json()) as ErrorBody
  } catch {
    body = null
  }

  return NextResponse.json(
    { error: body?.error || `HTTP ${response.status}` },
    { status: response.status }
  )
}

export function withRefreshCookie(payload: AuthSuccess) {
  const response = NextResponse.json({
    access_token: payload.access_token,
    expires_in: payload.expires_in,
  })

  response.cookies.set({
    name: REFRESH_COOKIE,
    value: payload.refresh_token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  })

  return response
}

export function clearRefreshCookie(response: NextResponse) {
  response.cookies.set({
    name: REFRESH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  })

  return response
}