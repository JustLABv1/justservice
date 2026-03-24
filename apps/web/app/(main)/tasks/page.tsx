"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Zap } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { useAuth } from "@/components/auth-provider"
import { tasks as tasksApi, type TaskDefinition } from "@/lib/api"

export default function HomePage() {
  const { user, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [allTasks, setAllTasks] = useState<TaskDefinition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (authLoading) return
    tasksApi.list().then(setAllTasks).finally(() => setIsLoading(false))
  }, [authLoading])

  // Focus search box on `k` key (cmd+k / ctrl+k)
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const filtered =
    query.trim() === ""
      ? allTasks
      : allTasks.filter(
          (t) =>
            t.name.toLowerCase().includes(query.toLowerCase()) ||
            t.description.toLowerCase().includes(query.toLowerCase()) ||
            t.category.toLowerCase().includes(query.toLowerCase())
        )

  // Group by category for display
  const grouped = filtered.reduce<Record<string, TaskDefinition[]>>(
    (acc, task) => {
      const cat = task.category || "General"
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(task)
      return acc
    },
    {}
  )

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  return (
    <div className="flex flex-col items-center px-6 py-12 max-w-4xl mx-auto w-full">
      {/* Greeting */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting}{user ? `, ${user.username}` : ""}
        </h1>
        <p className="mt-2 text-muted-foreground">What would you like to do today?</p>
      </div>

      {/* Search bar */}
      <div className="relative w-full max-w-xl mb-10">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          type="search"
          placeholder="Search tasks… (⌘K)"
          className="pl-10 h-12 text-base"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Task cards */}
      {isLoading ? (
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          <Zap className="mx-auto mb-4 h-10 w-10 opacity-30" />
          <p>No tasks found{query ? ` for "${query}"` : ""}</p>
        </div>
      ) : (
        <div className="w-full space-y-8">
          {Object.entries(grouped).map(([category, tasks]) => (
            <section key={category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {category}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => router.push(`/tasks/${encodeURIComponent(task.slug)}`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskCard({
  task,
  onClick,
}: {
  task: TaskDefinition
  onClick: () => void
}) {
  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{task.name}</CardTitle>
          <Badge variant={task.is_sync ? "default" : "secondary"} className="shrink-0 text-xs">
            {task.is_sync ? "Sync" : "Async"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="line-clamp-2 text-sm">
          {task.description}
        </CardDescription>
        <p className="mt-2 text-xs text-muted-foreground">via {task.plugin_name}</p>
      </CardContent>
    </Card>
  )
}
