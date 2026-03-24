import {
  jsonErrorFrom,
  postAuthJson,
  withRefreshCookie,
} from "../_lib/backend-auth"

export async function POST(request: Request) {
  const body = await request.json()
  const response = await postAuthJson("/api/auth/login", { body })

  if (!response.ok) {
    return jsonErrorFrom(response)
  }

  const payload = (await response.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return withRefreshCookie(payload)
}