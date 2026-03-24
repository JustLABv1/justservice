import { redirect } from "next/navigation"

// Middleware handles the smart redirect for / based on the session cookie.
// This is a fallback for any edge cases where middleware doesn't run.
export default function Page() {
  redirect("/login")
}
