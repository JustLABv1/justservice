"use client"

import { useCallback, useEffect, useState } from "react"
import { format, formatDistanceStrict } from "date-fns"
import {
  ArrowUpRight,
  CheckCircle,
  Clock,
  Filter,
  Loader2,
  RefreshCw,
  Timer,
  XCircle,
} from "lucide-react"

import { useRouter } from "next/navigation"
import { Button, Card, Pagination, Skeleton, cn } from "@heroui/react"
import { useAuth } from "@/components/auth-provider"
import { useDetailPanel } from "@/components/detail-panel"
import { ExecutionDetail, ExecutionStatusChip } from "@/components/execution-detail"
import { PageHeader } from "@/components/page-header"
import { SecondaryPanel, SecondaryPanelToggle } from "@/components/secondary-panel"
import { executions as execApi, type Execution } from "@/lib/api"

const STATUS_FILTERS = ["all", "running", "completed", "failed", "pending"] as const

const PAGE_SIZE = 10

function duration(exec: Execution) {
  const start = new Date(exec.started_at)
  const end = exec.completed_at ? new Date(exec.completed_at) : new Date()
  return formatDistanceStrict(end, start)
}

function outputPreview(exec: Execution) {
  if (exec.error?.Valid) return exec.error.String
  if (!exec.output) return "No output captured yet."

  const raw = JSON.stringify(exec.output)
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw
}

function statusCount(items: Execution[], status: Execution["status"]) {
  return items.filter((item) => item.status === status).length
}

function StatusSummaryCard({
  label,
  value,
  tone,
  icon,
  isActive,
  onPress,
}: {
  label: string
  value: number
  tone: "default" | "accent" | "success" | "danger"
  icon: React.ReactNode
  isActive?: boolean
  onPress?: () => void
}) {
  const toneClass = {
    default: "border-default-200 bg-default-50/60",
    accent: "border-primary/15 bg-primary/5",
    success: "border-success/15 bg-success/5",
    danger: "border-danger/15 bg-danger/5",
  }[tone]

  return (
    <button type="button" className="w-full text-left" onClick={onPress}>
      <Card className={cn("border shadow-none transition-shadow hover:shadow-sm", toneClass, isActive && "ring-2 ring-accent/40")}>
        <Card.Content className="flex flex-row items-center gap-2.5 p-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-background/80 text-foreground">
            {icon}
          </div>
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
            <p className="text-xl font-semibold tracking-tight">{value}</p>
          </div>
        </Card.Content>
      </Card>
    </button>
  )
}

function ExecutionCard({
  execution,
  onOpenDetail,
  onOpenPage,
}: {
  execution: Execution
  onOpenDetail: () => void
  onOpenPage: () => void
}) {
  const statusStyles = {
    completed: "border-success/15",
    failed: "border-danger/15",
    running: "border-primary/15",
    pending: "border-default-200",
  }[execution.status]

  return (
    <button type="button" className="w-full text-left" onClick={onOpenDetail}>
      <Card className={cn("border text-left shadow-none transition-transform hover:-translate-y-0.5", statusStyles)}>
        <Card.Content className="gap-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight">{execution.task_name || execution.task_slug}</h2>
              <ExecutionStatusChip status={execution.status} />
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-muted">{outputPreview(execution)}</p>
          </div>

          <div className="flex items-center gap-2 self-start">
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                onOpenPage()
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <ArrowUpRight data-icon="inline-end" />
              Open page
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 text-sm text-muted lg:grid-cols-[auto_auto_1fr]">
          <div className="rounded-lg bg-default-50/60 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Started</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {format(new Date(execution.started_at), "MMM d, HH:mm")}
            </p>
          </div>
          <div className="rounded-lg bg-default-50/60 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Duration</p>
            <p className="mt-1 text-sm font-medium text-foreground">{duration(execution)}</p>
          </div>
          <div className="col-span-2 rounded-lg bg-default-50/60 px-3 py-2.5 lg:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Execution ID</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground">{execution.id}</p>
          </div>
        </div>
        </Card.Content>
      </Card>
    </button>
  )
}

export default function ExecutionsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth()
  const router = useRouter()
  const { openDetail } = useDetailPanel()
  const [items, setItems] = useState<Execution[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [page, setPage] = useState(1)

  const load = useCallback(async () => {
    if (authLoading || !isAuthenticated) return
    setIsLoading(true)
    try {
      setItems(await execApi.list())
    } finally {
      setIsLoading(false)
    }
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      setItems([])
      setIsLoading(false)
      return
    }
    load()
  }, [authLoading, isAuthenticated, load])

  const filtered =
    statusFilter === "all" ? items : items.filter((e) => e.status === statusFilter)

  const totalRunning = statusCount(items, "running")
  const totalCompleted = statusCount(items, "completed")
  const totalFailed = statusCount(items, "failed")

  // Auto-refresh while executions are running
  useEffect(() => {
    if (totalRunning === 0) return
    const id = window.setInterval(async () => {
      if (authLoading || !isAuthenticated) return
      try {
        setItems(await execApi.list())
      } catch { /* silent background refresh */ }
    }, 5000)
    return () => window.clearInterval(id)
  }, [totalRunning, authLoading, isAuthenticated])

  // Reset page when filter changes
  useEffect(() => setPage(1), [statusFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function getPageNumbers() {
    const pages: (number | "ellipsis")[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push("ellipsis")
      const start = Math.max(2, page - 1)
      const end = Math.min(totalPages - 1, page + 1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (page < totalPages - 2) pages.push("ellipsis")
      pages.push(totalPages)
    }
    return pages
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Secondary Panel — Filters */}
      <SecondaryPanel title="Filters">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted flex items-center gap-1.5">
              <Filter className="size-3" />
              Status
            </span>
            <div className="flex flex-col gap-1">
              {STATUS_FILTERS.map((s) => (
                <Button
                  key={s}
                  variant={statusFilter === s ? "secondary" : "ghost"}
                  size="sm"
                  className="justify-between text-xs capitalize"
                  onPress={() => setStatusFilter(s)}
                >
                  <span>{s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  <span className="text-muted">
                    {s === "all" ? items.length : statusCount(items, s as Execution["status"])}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </SecondaryPanel>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader
          breadcrumbs={[{ label: "Executions" }]}
          actions={
            <div className="flex items-center gap-2">
              <SecondaryPanelToggle />
              <Button variant="secondary" size="sm" onPress={load}>
                <RefreshCw className="size-3.5" />
                Refresh
              </Button>
            </div>
          }
        />

        <div className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-36 rounded-2xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-muted">
              <p className="text-sm">
                {items.length === 0
                  ? "No executions yet. Run a task to see results here."
                  : "No executions match this filter."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatusSummaryCard
                  label="Total"
                  value={items.length}
                  tone="default"
                  icon={<Clock className="size-5" />}
                  isActive={statusFilter === "all"}
                  onPress={() => setStatusFilter("all")}
                />
                <StatusSummaryCard
                  label="Running"
                  value={totalRunning}
                  tone="accent"
                  icon={<Loader2 className="size-5 animate-spin" />}
                  isActive={statusFilter === "running"}
                  onPress={() => setStatusFilter("running")}
                />
                <StatusSummaryCard
                  label="Completed"
                  value={totalCompleted}
                  tone="success"
                  icon={<CheckCircle className="size-5" />}
                  isActive={statusFilter === "completed"}
                  onPress={() => setStatusFilter("completed")}
                />
                <StatusSummaryCard
                  label="Failed"
                  value={totalFailed}
                  tone="danger"
                  icon={<XCircle className="size-5" />}
                  isActive={statusFilter === "failed"}
                  onPress={() => setStatusFilter("failed")}
                />
              </div>

              <div className="flex items-center justify-between px-1">
                <div>
                  <p className="text-sm font-medium">Recent activity</p>
                  <p className="text-sm text-muted">
                    {statusFilter === "all"
                      ? `${filtered.length} executions across every status`
                      : `${filtered.length} ${statusFilter} execution${filtered.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="hidden items-center gap-2 text-xs text-muted sm:flex">
                  <Timer className="size-3.5" />
                  {totalRunning > 0 ? "Auto-refreshing every 5s." : "Live durations update on refresh."}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {paginated.map((exec) => (
                  <ExecutionCard
                    key={exec.id}
                    execution={exec}
                    onOpenDetail={() =>
                      openDetail(
                        exec.task_name || exec.task_slug,
                        <ExecutionDetail executionId={exec.id} embedded />
                      )
                    }
                    onOpenPage={() => router.push(`/executions/${exec.id}`)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex justify-center pt-2">
                  <Pagination>
                    <Pagination.Content>
                      <Pagination.Item>
                        <Pagination.Previous
                          isDisabled={page === 1}
                          onPress={() => setPage((p) => p - 1)}
                        >
                          <Pagination.PreviousIcon />
                          <span>Previous</span>
                        </Pagination.Previous>
                      </Pagination.Item>
                      {getPageNumbers().map((p, i) =>
                        p === "ellipsis" ? (
                          <Pagination.Item key={`ellipsis-${i}`}>
                            <Pagination.Ellipsis />
                          </Pagination.Item>
                        ) : (
                          <Pagination.Item key={p}>
                            <Pagination.Link
                              isActive={p === page}
                              onPress={() => setPage(p)}
                            >
                              {p}
                            </Pagination.Link>
                          </Pagination.Item>
                        )
                      )}
                      <Pagination.Item>
                        <Pagination.Next
                          isDisabled={page === totalPages}
                          onPress={() => setPage((p) => p + 1)}
                        >
                          <span>Next</span>
                          <Pagination.NextIcon />
                        </Pagination.Next>
                      </Pagination.Item>
                    </Pagination.Content>
                  </Pagination>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
