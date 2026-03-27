"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
} from "lucide-react"
import { Button, Card, Chip, SearchField, Skeleton } from "@heroui/react"
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
  const featured = allTasks.slice(0, 4)
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

  function handleSearch(value: string) {
    router.push(value.trim() ? `/tasks?q=${encodeURIComponent(value)}` : "/tasks")
  }

  return (
    <div className="flex flex-1 overflow-auto">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center gap-10 px-4 py-10 sm:px-6 lg:px-8">
        <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 text-center">
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Chip size="sm" variant="soft" color="accent">Quick launch</Chip>
              {!isLoading && <Chip size="sm" variant="soft">{allTasks.length} tasks available</Chip>}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{greeting}</h1>
            <p className="text-sm text-muted sm:text-base">
              Search for a task and jump straight into the workflow you need.
            </p>
          </div>

          <div className="w-full">
            <SearchField
              value={query}
              onChange={setQuery}
              onSubmit={handleSearch}
              className="gap-2"
            >
              <SearchField.Group className="h-14 rounded-[1.35rem] border border-default-200 bg-content1 shadow-sm transition-all data-[focus-within=true]:border-primary/30 data-[focus-within=true]:shadow-md">
                <SearchField.SearchIcon className="ml-4 size-4 text-muted" />
                <SearchField.Input
                  className="px-3 text-base"
                  placeholder="Search tasks, plugins, or categories"
                />
                <SearchField.ClearButton className="mr-2" />
              </SearchField.Group>
            </SearchField>

            {query.trim() ? (
              <Card
                className="mt-3 animate-fade-up overflow-hidden border border-default-200/80 text-left shadow-xl shadow-black/5"
                style={{ animationDelay: "120ms" }}
              >
                <Card.Content className="gap-0 p-0">
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
                        className="flex items-center justify-between border-t border-default-200 px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-default-50"
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
                </Card.Content>
              </Card>
            ) : null}
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">Suggested tasks</p>
              <p className="text-sm text-muted">A few quick starts, nothing more.</p>
            </div>
            <Button variant="ghost" size="sm" onPress={() => router.push("/tasks")}>
              Browse tasks
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 rounded-[1.35rem]" />
                ))
              : featured.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onPress={() => router.push(`/tasks/${task.slug}`)}
                    animationDelay={`${120 + index * 60}ms`}
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
  animationDelay,
}: {
  task: TaskDefinition
  onPress: () => void
  animationDelay?: string
}) {
  return (
    <button
      type="button"
      className="flex text-left"
      onClick={onPress}
    >
      <Card
        variant="secondary"
        className="animate-fade-up flex min-h-40 w-full rounded-[1.35rem] border border-default-200/70 bg-content1 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md"
        style={{ animationDelay }}
      >
        <Card.Header className="flex items-start justify-between gap-3 pb-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug line-clamp-2">{task.name}</p>
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
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
        <Card.Content className="flex flex-1 flex-col gap-3">
          <p className="min-h-[3.25rem] text-sm leading-5 text-muted line-clamp-3">{task.description}</p>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-default-100 pt-3">
            <div>
              <p className="text-xs font-medium text-foreground">{task.category || "General"}</p>
              <p className="text-[11px] text-muted">Open task details</p>
            </div>
            <ArrowRight className="size-4 text-muted" />
          </div>
        </Card.Content>
      </Card>
    </button>
  )
}
