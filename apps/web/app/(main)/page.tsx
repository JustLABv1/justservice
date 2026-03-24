"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Search,
} from "lucide-react"
import { Card, Chip, Skeleton } from "@heroui/react"
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
  const liveResults = query.trim()
    ? allTasks
        .filter((task) => {
          const term = query.toLowerCase()
          return (
            task.name.toLowerCase().includes(term) ||
            task.description.toLowerCase().includes(term) ||
            task.plugin_name.toLowerCase().includes(term) ||
            (task.category || "General").toLowerCase().includes(term)
          )
        })
        .slice(0, 6)
    : []

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(query.trim() ? `/tasks?q=${encodeURIComponent(query)}` : "/tasks")
  }

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <section className="flex flex-col items-center gap-4 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{greeting}</h1>
            <p className="text-sm text-muted sm:text-base">What would you like to run today?</p>
          </div>

          <div className="w-full max-w-2xl">
            <form onSubmit={handleSearch}>
              <label className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-default-200 bg-content1 px-4 shadow-sm transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/15">
                <Search className="size-5 shrink-0 text-muted" />
                <input
                  type="search"
                  placeholder="Search tasks..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted"
                />
              </label>
            </form>

            {query.trim() ? (
              <div className="mt-3 overflow-hidden rounded-2xl border bg-content1 text-left shadow-lg">
                {liveResults.length > 0 ? (
                  <div className="flex flex-col py-2">
                    {liveResults.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className="flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-default-100"
                        onClick={() => router.push(`/tasks/${task.slug}`)}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{task.name}</p>
                          <p className="truncate text-xs text-muted">
                            {task.plugin_name} · {task.category || "General"}
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
                      </button>
                    ))}
                    <button
                      type="button"
                      className="flex items-center justify-between border-t px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-default-50"
                      onClick={() => router.push(`/tasks?q=${encodeURIComponent(query)}`)}
                    >
                      <span>See all results for &quot;{query}&quot;</span>
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-5 text-sm text-muted">
                    No tasks match &quot;{query}&quot;.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Available tasks</p>
              <p className="text-xs text-muted">A few tasks to get started quickly.</p>
            </div>
            <button
              type="button"
              className="text-sm text-accent transition-colors hover:text-foreground"
              onClick={() => router.push("/tasks")}
            >
              View all
            </button>
          </div>

          <div className="flex items-stretch gap-4 overflow-x-auto pb-2">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-72 shrink-0 rounded-[1.5rem]" />
                ))
              : featured.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onPress={() => router.push(`/tasks/${task.slug}`)}
                  />
                ))}
          </div>
        </section>
      </div>
    </div>
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
      className="flex w-72 shrink-0 text-left"
      onClick={onPress}
    >
      <Card className="flex min-h-44 w-full rounded-[1.5rem] border border-default-200 bg-content1 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-lg">
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
        <Card.Content className="flex flex-1 flex-col gap-4">
          <p className="min-h-[4.5rem] text-sm leading-6 text-muted line-clamp-3">{task.description}</p>
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

