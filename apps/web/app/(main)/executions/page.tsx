"use client"

import { useEffect, useState } from "react"
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
import { Button, Card, Chip, Skeleton, cn } from "@heroui/react"
import { useAuth } from "@/components/auth-provider"
import { useDetailPanel } from "@/components/detail-panel"
import { ExecutionDetail } from "@/components/execution-detail"
import { PageHeader } from "@/components/page-header"
import { SecondaryPanel, SecondaryPanelToggle } from "@/components/secondary-panel"
import { executions as execApi, type Execution } from "@/lib/api"

const STATUS_FILTERS = ["all", "running", "completed", "failed", "pending"] as const

function StatusChip({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Chip color="success" variant="soft" size="sm" className="gap-1">
          <CheckCircle className="size-3" />
          Completed
        </Chip>
      )
    case "failed":
      return (
        <Chip color="danger" variant="soft" size="sm" className="gap-1">
          <XCircle className="size-3" />
          Failed
        </Chip>
      )
    case "running":
      return (
        <Chip color="accent" variant="soft" size="sm" className="gap-1">
          <Loader2 className="size-3 animate-spin" />
          Running
        </Chip>
      )
    default:
      return (
        <Chip variant="soft" size="sm" className="gap-1">
          <Clock className="size-3" />
          Pending
        </Chip>
      )
  }
}

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
}: {
  label: string
  value: number
  tone: "default" | "accent" | "success" | "danger"
  icon: React.ReactNode
}) {
  const toneClass = {
    default: "border-default-200 bg-default-50/60",
    accent: "border-primary/15 bg-primary/5",
    success: "border-success/15 bg-success/5",
    danger: "border-danger/15 bg-danger/5",
  }[tone]

  return (
    <Card className={cn("border shadow-none", toneClass)}>
      <Card.Content className="flex flex-row items-center gap-3 p-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-background/80 text-foreground">
          {icon}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
      </Card.Content>
    </Card>
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
        <Card.Content className="gap-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{execution.task_name || execution.task_slug}</h2>
              <StatusChip status={execution.status} />
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">{outputPreview(execution)}</p>
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

        <div className="grid grid-cols-1 gap-3 text-sm text-muted sm:grid-cols-3">
          <div className="rounded-xl bg-default-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">Started</p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {format(new Date(execution.started_at), "MMM d, HH:mm")}
            </p>
          </div>
          <div className="rounded-xl bg-default-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">Duration</p>
            <p className="mt-1 text-sm font-medium text-foreground">{duration(execution)}</p>
          </div>
          <div className="rounded-xl bg-default-50/60 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">Execution ID</p>
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

  async function load() {
    if (authLoading || !isAuthenticated) return
    setIsLoading(true)
    try {
      setItems(await execApi.list())
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      setItems([])
      setIsLoading(false)
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  const filtered =
    statusFilter === "all" ? items : items.filter((e) => e.status === statusFilter)

  const totalRunning = statusCount(items, "running")
  const totalCompleted = statusCount(items, "completed")
  const totalFailed = statusCount(items, "failed")

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
                    {s === "all" ? items.length : statusCount(items, s)}
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
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
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
                />
                <StatusSummaryCard
                  label="Running"
                  value={totalRunning}
                  tone="accent"
                  icon={<Loader2 className="size-5 animate-spin" />}
                />
                <StatusSummaryCard
                  label="Completed"
                  value={totalCompleted}
                  tone="success"
                  icon={<CheckCircle className="size-5" />}
                />
                <StatusSummaryCard
                  label="Failed"
                  value={totalFailed}
                  tone="danger"
                  icon={<XCircle className="size-5" />}
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
                  Live durations update on refresh.
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {filtered.map((exec) => (
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

