"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "@heroui/react"

import { Button, Card, Input, Label, Separator } from "@heroui/react"
import { useAuth } from "@/components/auth-provider"
import { auth as authApi } from "@/lib/api"

export default function LoginPage() {
  const router = useRouter()
  const { login, isAuthenticated, isLoading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [providers, setProviders] = useState<Array<{ id: string; name: string }> | null>(null)

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const next = new URLSearchParams(window.location.search).get("next")
      router.replace(next && next.startsWith("/") ? next : "/")
    }
  }, [authLoading, isAuthenticated, router])

  useEffect(() => {
    authApi.listOIDCProviders().then(setProviders).catch(() => setProviders([]))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oidcError = params.get("oidc_error")
    if (!oidcError) {
      return
    }

    toast.danger(oidcError)

    params.delete("oidc_error")
    const next = params.get("next")
    const target = next && next.startsWith("/") && !next.startsWith("//")
      ? `/login?next=${encodeURIComponent(next)}`
      : "/login"
    router.replace(target)
  }, [router])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = form.get("username") as string
    const password = form.get("password") as string

    setIsLoading(true)
    try {
      await login(username, password)
      const next = new URLSearchParams(window.location.search).get("next")
      router.push(next && next.startsWith("/") ? next : "/")
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Login failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <Card.Header className="text-center">
        <Card.Title>Sign in</Card.Title>
        <Card.Description>Enter your credentials to continue</Card.Description>
      </Card.Header>
      <Card.Content>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username or Email</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="you@example.com"
              required
              disabled={isLoading}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              required
              disabled={isLoading}
            />
          </div>
          <Button type="submit" className="w-full" isDisabled={isLoading}>
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        {providers && providers.length > 0 && (
          <>
            <div className="flex items-center gap-3 my-4">
              <Separator className="flex-1" />
              <span className="text-xs text-muted">or</span>
              <Separator className="flex-1" />
            </div>
            <div className="flex flex-col gap-2">
              {providers.map((p) => (
                <Button
                  key={p.id}
                  variant="secondary"
                  className="w-full"
                  onPress={() => {
                    const params = new URLSearchParams(window.location.search)
                    const next = params.get("next")
                    const destination = next && next.startsWith("/") && !next.startsWith("//")
                      ? `/api/auth/oidc/${p.id}/authorize?next=${encodeURIComponent(next)}`
                      : `/api/auth/oidc/${p.id}/authorize`
                    window.location.href = destination
                  }}
                >
                  Continue with {p.name}
                </Button>
              ))}
            </div>
          </>
        )}
      </Card.Content>
      <Card.Footer className="justify-center">
        <p className="text-sm text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium underline-offset-4 hover:underline">
            Register
          </Link>
        </p>
      </Card.Footer>
    </Card>
  )
}
