"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { format } from "date-fns"
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { executions as execApi, type Execution } from "@/lib/api"

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge className="gap-1 bg-green-500/10 text-green-600 hover:bg-green-500/20">
          <CheckCircle className="h-3 w-3" />
          Completed
        </Badge>
      )
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      )
    case "running":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Running
        </Badge>
      )
    default:
      return <Badge variant="outline">Pending</Badge>
  }
}

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [execution, setExecution] = useState<Execution | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const load = useCallback(async () => {
    try {
      const exec = await execApi.get(id)
      setExecution(exec)
      return exec
    } catch {
      router.push("/executions")
    } finally {
      setIsLoading(false)
    }
  }, [id, router])

  function connectStream(exec: Execution) {
    if (exec.status !== "pending" && exec.status !== "running") return
    if (eventSourceRef.current) return

    const url = execApi.streamUrl(id)
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.log) setLogs((prev) => [...prev, data.log as string])
        if (data.status) {
          setExecution((prev) =>
            prev ? { ...prev, status: data.status, output: data.output ?? prev.output } : prev
          )
          if (data.status === "completed" || data.status === "failed") {
            es.close()
            eventSourceRef.current = null
            load()
          }
        }
      } catch {
        // non-JSON log line
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
  }, [id])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!execution) return null

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/executions")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{execution.task_slug}</h1>
            <StatusBadge status={execution.status} />
          </div>
          <p className="text-xs text-muted-foreground">ID: {execution.id}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Started</p>
          <p>{format(new Date(execution.started_at), "PPpp")}</p>
        </div>
        {execution.completed_at && (
          <div>
            <p className="text-muted-foreground">Completed</p>
            <p>{format(new Date(execution.completed_at), "PPpp")}</p>
          </div>
        )}
      </div>

      {/* Input */}
      {execution.input && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Input</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted rounded-md p-4 overflow-auto max-h-48">
              {JSON.stringify(execution.input, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Live Output</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-mono text-xs bg-muted rounded-md p-4 overflow-auto max-h-64 space-y-0.5">
              {logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Output */}
      {execution.output && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Output</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted rounded-md p-4 overflow-auto max-h-64">
              {JSON.stringify(execution.output, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {execution.error?.Valid && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-sm text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{execution.error.String}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
