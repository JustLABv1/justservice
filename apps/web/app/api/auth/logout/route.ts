import { clearRefreshCookie, postAuthJson } from "../_lib/backend-auth"
import { NextResponse } from "next/server"

export async function POST() {
  await postAuthJson("/api/auth/logout", {
    includeRefreshCookie: true,
  })

  return clearRefreshCookie(NextResponse.json({ message: "logged out" }))
}