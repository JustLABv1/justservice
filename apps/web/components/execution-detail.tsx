"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { format, formatDistanceStrict } from "date-fns"
import {
  CheckCircle,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react"

import { Button, Card, Chip, Separator, Skeleton } from "@heroui/react"
import { executions as execApi, type Execution } from "@/lib/api"

function StatusBadge({ status }: { status: string }) {
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
        <Chip color="default" variant="soft" size="sm" className="gap-1">
          <Loader2 className="size-3 animate-spin" />
          Running
        </Chip>
      )
    default:
      return <Chip variant="soft" size="sm">Pending</Chip>
  }
}

interface ExecutionDetailProps {
  executionId: string
  embedded?: boolean
}

function formatPayload(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function formatDuration(execution: Execution) {
  const start = new Date(execution.started_at)
  const end = execution.completed_at ? new Date(execution.completed_at) : new Date()
  return formatDistanceStrict(end, start)
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{title}</p>
      </div>
      {children}
    </section>
  )
}

export function ExecutionDetail({ executionId, embedded }: ExecutionDetailProps) {
  const router = useRouter()
  const [execution, setExecution] = useState<Execution | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const load = useCallback(async () => {
    try {
      const exec = await execApi.get(executionId)
      setExecution(exec)
      return exec
    } catch {
      if (!embedded) router.push("/executions")
    } finally {
      setIsLoading(false)
    }
  }, [executionId, embedded, router])

  function connectStream(exec: Execution) {
    if (exec.status !== "pending" && exec.status !== "running") return
    if (eventSourceRef.current) return

    const url = execApi.streamUrl(executionId)
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.log) setLogs((prev) => [...prev, data.log as string])
        if (data.status) {
          setExecution((prev) =>
            prev
              ? { ...prev, status: data.status, output: data.output ?? prev.output }
              : prev
          )
          if (data.status === "completed" || data.status === "failed") {
            es.close()
            eventSourceRef.current = null
            load()
          }
        }
      } catch {
        setLogs((prev) => [...prev, e.data])
      }
    }

    es.onerror = () => {
      es.close()
      eventSourceRef.current = null
    }
  }

  useEffect(() => {
    load().then((exec) => {
      if (exec) connectStream(exec)
    })
    return () => {
      eventSourceRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!execution) return null

  const isCompact = embedded ?? false
  const metaCards = [
    {
      label: "Started",
      value: format(new Date(execution.started_at), "PPpp"),
      helper: formatDistanceStrict(new Date(), new Date(execution.started_at), {
        addSuffix: true,
      }),
    },
    {
      label: "Duration",
      value: formatDuration(execution),
      helper: execution.completed_at ? "Finished" : "Still active",
    },
    {
      label: "Task",
      value: execution.task_name || execution.task_slug,
      helper: execution.task_slug,
    },
  ]

  if (execution.completed_at) {
    metaCards.splice(1, 0, {
      label: "Completed",
      value: format(new Date(execution.completed_at), "PPpp"),
      helper: "Terminal state",
    })
  }

  return (
    <div className={isCompact ? "flex flex-col gap-4" : "flex flex-col gap-6"}>
      <div className="flex flex-col gap-3 rounded-2xl border bg-content1 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={isCompact ? "text-lg font-semibold" : "text-2xl font-semibold tracking-tight"}>
                {execution.task_name || execution.task_slug}
              </h2>
              <StatusBadge status={execution.status} />
            </div>
            <p className="mt-2 break-all font-mono text-xs text-muted">{execution.id}</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Button variant="ghost" isIconOnly size="sm" onPress={() => load()}>
              <RefreshCw className="size-4" />
              <span className="sr-only">Refresh</span>
            </Button>
            {embedded && (
              <Button
                variant="ghost"
                isIconOnly
                size="sm"
                onPress={() => router.push(`/executions/${execution.id}`)}
              >
                <ExternalLink className="size-4" />
                <span className="sr-only">Open full page</span>
              </Button>
            )}
          </div>
        </div>

        <Separator />

        <div className={isCompact ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"}>
          {metaCards.map((item) => (
            <Card key={item.label} className="border border-default-100 bg-default-50/40 shadow-none">
              <Card.Content className="gap-1 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{item.label}</p>
                <p className="text-sm font-medium leading-6 text-foreground">{item.value}</p>
                <p className="text-xs text-muted">{item.helper}</p>
              </Card.Content>
            </Card>
          ))}
        </div>
      </div>

      {execution.error?.Valid && (
        <Section title="Error">
          <div className="rounded-2xl border border-danger/20 bg-danger/5 p-4">
            <p className="text-sm leading-6 text-danger">{execution.error.String}</p>
          </div>
        </Section>
      )}

      <div className={isCompact ? "flex flex-col gap-4" : "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"}>
        <div className="flex min-w-0 flex-col gap-6">
          {execution.output && (
            <Section title="Output">
              <pre className="max-h-[42rem] overflow-auto rounded-2xl border bg-surface-secondary p-5 font-mono text-sm leading-7 text-foreground">
                {formatPayload(execution.output)}
              </pre>
            </Section>
          )}

          {logs.length > 0 && (
            <Section title="Live Output">
              <div className="flex max-h-[32rem] flex-col gap-1 overflow-auto rounded-2xl border bg-surface-secondary p-5 font-mono text-sm leading-7 text-foreground">
                {logs.map((line, i) => (
                  <div key={i} className="break-words">{line}</div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </Section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {execution.input && (
            <Section title="Input">
              <pre className="max-h-[24rem] overflow-auto rounded-2xl border bg-surface-secondary p-5 font-mono text-sm leading-7 text-foreground">
                {formatPayload(execution.input)}
              </pre>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
