"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Play,
  Search,
  Sparkles,
  Workflow,
} from "lucide-react"
import { Button, Card, Chip, Input, Skeleton } from "@heroui/react"
import { useAuth } from "@/components/auth-provider"
import { tasks as tasksApi, type TaskDefinition } from "@/lib/api"

export default function HomePage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [allTasks, setAllTasks] = useState<TaskDefinition[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    tasksApi.list().then(setAllTasks).finally(() => setIsLoading(false))
  }, [authLoading])

  const greeting = user ? `Hello, ${user.username}!` : "Hello!"
  const featured = allTasks.slice(0, 10)
  const categories = Array.from(
    new Set(allTasks.map((task) => task.category || "General"))
  ).slice(0, 4)
  const syncCount = allTasks.filter((task) => task.is_sync).length
  const asyncCount = allTasks.length - syncCount

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(query.trim() ? `/tasks?q=${encodeURIComponent(query)}` : "/tasks")
  }

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-default-200 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.14),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-6 sm:p-8 lg:p-10">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent,rgba(255,255,255,0.02),transparent)]" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_22rem] lg:items-end">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <Chip variant="soft" color="accent" size="sm">
                  <Sparkles className="mr-1 size-3" />
                  Workspace overview
                </Chip>
                <Chip variant="soft" size="sm">{allTasks.length} tasks available</Chip>
              </div>

              <div className="max-w-3xl space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  {greeting}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">
                  Search, launch, and revisit the tasks your team actually uses. The home view should help you start fast, not disappear into empty space.
                </p>
              </div>

              <form onSubmit={handleSearch} className="max-w-3xl">
                <div className="rounded-[1.5rem] border border-default-200 bg-content1/70 p-3 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.6)] backdrop-blur">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
                      <Input
                        type="search"
                        placeholder="Search tasks, plugins, or categories"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        variant="secondary"
                        className="min-h-14 pl-12 text-base"
                      />
                    </div>
                    <div className="flex gap-2 sm:shrink-0">
                      <Button type="submit" size="lg" className="flex-1 bg-primary text-primary-foreground sm:flex-none">
                        Search tasks
                        <ArrowRight data-icon="inline-end" />
                      </Button>
                      <Button variant="ghost" size="lg" onPress={() => router.push("/tasks")}>
                        Browse all
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <MetricCard label="Categories" value={categories.length} helper={categories.join(" • ") || "No categories yet"} icon={<Workflow className="size-5" />} />
              <MetricCard label="Sync tasks" value={syncCount} helper="Immediate results" icon={<Play className="size-5" />} />
              <MetricCard label="Async tasks" value={asyncCount} helper="Longer-running workflows" icon={<Sparkles className="size-5" />} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="rounded-[1.75rem] border bg-content1 p-5 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Featured tasks</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight">Popular entry points</h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  A cleaner starting set instead of a cramped horizontal strip.
                </p>
              </div>
              <Button variant="ghost" size="sm" onPress={() => router.push("/tasks")}>
                View all tasks
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-52 rounded-[1.5rem]" />
                  ))
                : featured.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onPress={() => router.push(`/tasks/${task.slug}`)}
                    />
                  ))}
            </div>
          </div>

          <aside className="rounded-[1.75rem] border bg-content1 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Quick focus</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Browse by category</h2>
            <div className="mt-5 flex flex-col gap-3">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 rounded-2xl" />
                  ))
                : categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className="flex items-center justify-between rounded-2xl border bg-default-50/50 px-4 py-3 text-left transition-colors hover:bg-default-100"
                      onClick={() => router.push(`/tasks?q=${encodeURIComponent(category)}`)}
                    >
                      <div>
                        <p className="text-sm font-medium">{category}</p>
                        <p className="text-xs text-muted">Open matching tasks</p>
                      </div>
                      <ArrowRight className="size-4 text-muted" />
                    </button>
                  ))}
            </div>
          </aside>
        </section>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string
  value: number
  helper: string
  icon: React.ReactNode
}) {
  return (
    <Card className="border border-default-200 bg-content1/70 shadow-none backdrop-blur">
      <Card.Content className="flex flex-row items-center gap-4 p-4">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-default-100 text-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted">{helper}</p>
        </div>
      </Card.Content>
    </Card>
  )
}

function TaskCard({
  task,
  onPress,
}: {
  task: TaskDefinition
  onPress: () => void
}) {
  return (
    <button
      type="button"
      className="h-full text-left"
      onClick={onPress}
    >
      <Card className="h-full rounded-[1.5rem] border border-default-200 bg-content1 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg">
        <Card.Header className="flex items-start justify-between gap-3 pb-2">
          <div className="min-w-0">
            <p className="text-base font-semibold leading-snug line-clamp-2">{task.name}</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">
              {task.plugin_name}
            </p>
          </div>
          <Chip
            size="sm"
            color={task.is_sync ? "accent" : "default"}
            variant="soft"
            className="shrink-0"
          >
            {task.is_sync ? "Sync" : "Async"}
          </Chip>
        </Card.Header>
        <Card.Content className="flex h-full flex-col gap-4">
          <p className="text-sm leading-6 text-muted line-clamp-3">{task.description}</p>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-default-100 pt-4">
            <div>
              <p className="text-xs font-medium text-foreground">{task.category || "General"}</p>
              <p className="text-xs text-muted">Open task details</p>
            </div>
            <ArrowRight className="size-4 text-muted" />
          </div>
        </Card.Content>
      </Card>
    </button>
  )
}

