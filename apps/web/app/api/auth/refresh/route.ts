import {
  clearRefreshCookie,
  jsonErrorFrom,
  postAuthJson,
  withRefreshCookie,
} from "../_lib/backend-auth"

export async function POST() {
  const response = await postAuthJson("/api/auth/refresh", {
    includeRefreshCookie: true,
  })

  if (!response.ok) {
    return clearRefreshCookie(await jsonErrorFrom(response))
  }

  const payload = (await response.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return withRefreshCookie(payload)
}