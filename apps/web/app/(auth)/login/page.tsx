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
    <Card className="w-full rounded-[1.75rem] border border-default-200/70 bg-content1/95 shadow-xl shadow-black/5 backdrop-blur-sm">
      <Card.Header className="gap-3 pb-2 text-left">
        <div className="space-y-2">
          <Card.Title className="text-2xl tracking-tight">Sign in</Card.Title>
          <Card.Description className="text-sm leading-6">
            Use your workspace account to launch tasks, review recent runs, and manage operational workflows.
          </Card.Description>
        </div>
      </Card.Header>
      <Card.Content className="gap-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username or Email</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="you@example.com"
              variant="secondary"
              className="h-11"
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
              variant="secondary"
              className="h-11"
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
            <div className="my-4 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs font-medium uppercase tracking-[0.16em] text-muted">SSO</span>
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
      <Card.Footer className="justify-start pt-2">
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
