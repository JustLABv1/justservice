"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ChevronRight,
  Copy,
  ExternalLink,
  LayoutGrid,
  List,
  MoreHorizontal,
  Play,
  Search,
  Zap,
} from "lucide-react"
import { toast } from "@heroui/react"

import {
  Button,
  Card,
  Chip,
  Dropdown,
  Input,
  Label,
  Skeleton,
  cn,
} from "@heroui/react"
import { useAuth } from "@/components/auth-provider"
import { useDetailPanel } from "@/components/detail-panel"
import { PageHeader } from "@/components/page-header"
import { SecondaryPanel, SecondaryPanelToggle } from "@/components/secondary-panel"
import { TaskContextMenu } from "@/components/task-context-menu"
import { TaskRunner } from "@/components/task-runner"
import { tasks as tasksApi, type TaskDefinition } from "@/lib/api"

export default function TasksPage() {
  return (
    <Suspense fallback={<TasksPageSkeleton />}>
      <TasksPageContent />
    </Suspense>
  )
}

function TasksPageContent() {
  const { isLoading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") ?? ""
  const { openDetail } = useDetailPanel()
  const [query, setQuery] = useState(initialQuery)
  const [allTasks, setAllTasks] = useState<TaskDefinition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({})
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (authLoading) return
    tasksApi.list().then(setAllTasks).finally(() => setIsLoading(false))
  }, [authLoading])

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

  const filtered = allTasks.filter((t) => {
    const matchesQuery =
      query.trim() === "" ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.description.toLowerCase().includes(query.toLowerCase()) ||
      t.plugin_name.toLowerCase().includes(query.toLowerCase()) ||
      (t.category || "General").toLowerCase().includes(query.toLowerCase())
    const matchesCategory =
      !selectedCategory || (t.category || "General") === selectedCategory
    return matchesQuery && matchesCategory
  })

  const categories = allTasks.reduce<Record<string, number>>((acc, task) => {
    const cat = task.category || "General"
    acc[cat] = (acc[cat] || 0) + 1
    return acc
  }, {})

  function toggleCategory(cat: string) {
    setOpenCategories((prev) => ({ ...prev, [cat]: !(prev[cat] ?? true) }))
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Secondary Panel — Category Tree */}
      <SecondaryPanel title="Categories">
        <div className="flex flex-col gap-1">
          <button
            className={cn(
              "flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
              !selectedCategory
                ? "bg-accent/10 text-accent font-medium"
                : "text-muted hover:bg-surface-secondary"
            )}
            onClick={() => setSelectedCategory(null)}
          >
            <span>All Tasks</span>
            <Chip size="sm" variant="soft">{allTasks.length}</Chip>
          </button>
          {Object.entries(categories).map(([cat, count]) => {
            const isOpen = openCategories[cat] ?? true
            return (
              <div key={cat}>
                <button
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                    selectedCategory === cat
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-muted hover:bg-surface-secondary"
                  )}
                  onClick={() => {
                    setSelectedCategory(selectedCategory === cat ? null : cat)
                    if (selectedCategory !== cat)
                      setOpenCategories((p) => ({ ...p, [cat]: true }))
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <ChevronRight
                      className={cn(
                        "size-3 transition-transform",
                        isOpen && "rotate-90"
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleCategory(cat)
                      }}
                    />
                    {cat}
                  </span>
                  <Chip size="sm" variant="soft">{count}</Chip>
                </button>
                {isOpen && (
                  <div className="ml-4 flex flex-col gap-0.5 py-1">
                    {allTasks
                      .filter((t) => (t.category || "General") === cat)
                      .map((t) => (
                        <button
                          key={t.id}
                          className="truncate rounded px-2 py-1 text-left text-xs text-muted hover:bg-surface-secondary transition-colors"
                          onClick={() =>
                            openDetail(t.name, <TaskRunner task={t} />)
                          }
                        >
                          {t.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SecondaryPanel>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader
          breadcrumbs={[{ label: "Tasks" }]}
          actions={
            <div className="flex items-center gap-2">
              <SecondaryPanelToggle />
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted pointer-events-none" />
                <Input
                  ref={searchRef}
                  type="search"
                  placeholder="Search… (⌘K)"
                  className="h-8 w-56 pl-8 text-sm"
                  variant="secondary"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {/* View mode toggle */}
              <div className="flex rounded-lg border border-default overflow-hidden">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  isIconOnly
                  size="sm"
                  onPress={() => setViewMode("grid")}
                  className="rounded-none"
                >
                  <LayoutGrid className="size-3.5" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  isIconOnly
                  size="sm"
                  onPress={() => setViewMode("list")}
                  className="rounded-none"
                >
                  <List className="size-3.5" />
                </Button>
              </div>
            </div>
          }
        />

        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted">
              <Zap className="mb-3 size-8 opacity-30" />
              <p className="text-sm">
                No tasks found{query ? ` for "${query}"` : ""}
              </p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((task) => (
                <TaskContextMenu key={task.id} task={task}>
                  <TaskCard
                    task={task}
                    onClick={() =>
                      openDetail(task.name, <TaskRunner task={task} />)
                    }
                    onAction={(action) => {
                      if (action === "run")
                        openDetail(task.name, <TaskRunner task={task} />)
                      else if (action === "open")
                        router.push(`/tasks/${task.slug}`)
                      else if (action === "copy") {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/tasks/${task.slug}`
                        )
                        toast.success("Link copied")
                      }
                    }}
                  />
                </TaskContextMenu>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {filtered.map((task) => (
                <TaskContextMenu key={task.id} task={task}>
                  <TaskListItem
                    task={task}
                    onClick={() =>
                      openDetail(task.name, <TaskRunner task={task} />)
                    }
                  />
                </TaskContextMenu>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TasksPageSkeleton() {
  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskCard({
  task,
  onClick,
  onAction,
}: {
  task: TaskDefinition
  onClick: () => void
  onAction: (action: "run" | "open" | "copy") => void
}) {
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <Card.Header className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <Card.Title className="text-sm leading-snug">{task.name}</Card.Title>
          <div className="flex items-center gap-1 shrink-0">
            <Chip
              size="sm"
              color={task.is_sync ? "accent" : "default"}
              variant="soft"
            >
              {task.is_sync ? "Sync" : "Async"}
            </Chip>
            <Dropdown>
              <Dropdown.Trigger>
                <Button
                  variant="ghost"
                  isIconOnly
                  size="sm"
                  onPress={(e) => e.continuePropagation?.()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </Dropdown.Trigger>
              <Dropdown.Popover>
                <Dropdown.Menu
                  onAction={(key) => {
                    if (key === "run") onAction("run")
                    else if (key === "open") onAction("open")
                    else if (key === "copy") onAction("copy")
                  }}
                >
                  <Dropdown.Item id="run" textValue="Run task">
                    <Play className="size-4" />
                    <Label>Run task</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="open" textValue="Open full page">
                    <ExternalLink className="size-4" />
                    <Label>Open full page</Label>
                  </Dropdown.Item>
                  <Dropdown.Item id="copy" textValue="Copy link">
                    <Copy className="size-4" />
                    <Label>Copy link</Label>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </div>
      </Card.Header>
      <Card.Content>
        <Card.Description className="line-clamp-2 text-xs">
          {task.description}
        </Card.Description>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted">{task.plugin_name}</span>
          {task.category && (
            <>
              <span className="text-muted">&middot;</span>
              <span className="text-xs text-muted">{task.category}</span>
            </>
          )}
        </div>
      </Card.Content>
    </Card>
  )
}

function TaskListItem({
  task,
  onClick,
}: {
  task: TaskDefinition
  onClick: () => void
}) {
  return (
    <button
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-secondary"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.name}</p>
        <p className="text-xs text-muted truncate">{task.description}</p>
      </div>
      <Chip
        size="sm"
        color={task.is_sync ? "accent" : "default"}
        variant="soft"
        className="shrink-0"
      >
        {task.is_sync ? "Sync" : "Async"}
      </Chip>
      <span className="text-xs text-muted shrink-0">{task.plugin_name}</span>
    </button>
  )
}
