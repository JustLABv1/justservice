"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "@heroui/react"

import { Button, Card, Input, Label } from "@heroui/react"
import { useAuth } from "@/components/auth-provider"
import { auth as authApi } from "@/lib/api"

export default function RegisterPage() {
  const router = useRouter()
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/")
    }
  }, [authLoading, isAuthenticated, router])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const username = form.get("username") as string
    const email = form.get("email") as string
    const password = form.get("password") as string
    const confirm = form.get("confirm") as string

    if (password !== confirm) {
      toast.danger("Passwords do not match")
      return
    }

    setIsLoading(true)
    try {
      await authApi.register(username, email, password)
      toast.success("Account created! Please sign in.")
      router.push("/login")
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full rounded-[1.75rem] border border-default-200/70 bg-content1/95 shadow-xl shadow-black/5 backdrop-blur-sm">
      <Card.Header className="gap-3 pb-2 text-left">
        <div className="space-y-2">
          <Card.Title className="text-2xl tracking-tight">Create account</Card.Title>
          <Card.Description className="text-sm leading-6">
            Set up an operator account to run tasks, track execution history, and work from the shared control surface.
          </Card.Description>
        </div>
      </Card.Header>
      <Card.Content className="gap-0">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="johndoe"
              variant="secondary"
              className="h-11"
              required
              disabled={isLoading}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
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
              autoComplete="new-password"
              placeholder="••••••••"
              variant="secondary"
              className="h-11"
              required
              minLength={8}
              disabled={isLoading}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              variant="secondary"
              className="h-11"
              required
              minLength={8}
              disabled={isLoading}
            />
          </div>
          <Button type="submit" className="w-full" isDisabled={isLoading}>
            {isLoading ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </Card.Content>
      <Card.Footer className="justify-start pt-2">
        <p className="text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </Card.Footer>
    </Card>
  )
}
