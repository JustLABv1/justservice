"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle, Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  executions as execApi,
  tasks as tasksApi,
  type Execution,
  type TaskDefinition,
} from "@/lib/api"

// Minimal JSON schema field renderer
function SchemaField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string
  schema: Record<string, unknown>
  value: string
  onChange: (val: string) => void
}) {
  const label = (schema.title as string) || name
  const description = schema.description as string | undefined
  const type = schema.type as string

  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>
        {label}
        {!!schema.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      <Input
        id={name}
        type={type === "integer" || type === "number" ? "number" : "text"}
        placeholder={description}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

export default function TaskPage() {
  const params = useParams()
  const router = useRouter()
  const slug = decodeURIComponent(params.slug as string)

  const [task, setTask] = useState<TaskDefinition | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [isExecuting, setIsExecuting] = useState(false)
  const [execution, setExecution] = useState<Execution | null>(null)

  useEffect(() => {
    tasksApi
      .get(slug)
      .then(setTask)
      .catch(() => router.push("/"))
      .finally(() => setIsLoading(false))
  }, [slug, router])

  function buildInput(): Record<string, unknown> {
    if (!task) return {}
    const schema = task.input_schema as {
      properties?: Record<string, Record<string, unknown>>
    }
    const result: Record<string, unknown> = {}
    for (const [key, fieldSchema] of Object.entries(schema.properties ?? {})) {
      const raw = fieldValues[key] ?? ""
      const type = fieldSchema.type as string
      if (type === "integer") result[key] = parseInt(raw, 10)
      else if (type === "number") result[key] = parseFloat(raw)
      else if (type === "boolean") result[key] = raw === "true"
      else result[key] = raw
    }
    return result
  }

  async function handleExecute(e: React.FormEvent) {
    e.preventDefault()
    if (!task) return
    setIsExecuting(true)
    try {
      const exec = await tasksApi.execute(slug, buildInput())
      setExecution(exec)
      if (task.is_sync) {
        // Execution is already complete, show result
      } else {
        // Poll execution status
        pollExecution(exec.id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Execution failed")
      setIsExecuting(false)
    }
  }

  function pollExecution(id: string) {
    const interval = setInterval(async () => {
      try {
        const exec = await execApi.get(id)
        setExecution(exec)
        if (exec.status === "completed" || exec.status === "failed") {
          clearInterval(interval)
          setIsExecuting(false)
        }
      } catch {
        clearInterval(interval)
        setIsExecuting(false)
      }
    }, 1500)
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!task) return null

  const properties = (task.input_schema as any)?.properties ?? {}
  const hasFields = Object.keys(properties).length > 0

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{task.name}</h1>
            <Badge variant={task.is_sync ? "default" : "secondary"}>
              {task.is_sync ? "Sync" : "Async"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{task.description}</p>
        </div>
      </div>

      {/* Input form */}
      <Card>
        <CardHeader>
          <CardTitle>Parameters</CardTitle>
          {!hasFields && (
            <CardDescription>This task requires no parameters.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleExecute} className="space-y-4">
            {hasFields &&
              Object.entries(properties).map(([key, schema]) => (
                <SchemaField
                  key={key}
                  name={key}
                  schema={schema as Record<string, unknown>}
                  value={fieldValues[key] ?? ""}
                  onChange={(val) =>
                    setFieldValues((prev) => ({ ...prev, [key]: val }))
                  }
                />
              ))}
            <Button
              type="submit"
              disabled={isExecuting}
              className="w-full"
            >
              {isExecuting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isExecuting ? "Running…" : "Run task"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Result */}
      {execution && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              {execution.status === "completed" ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : execution.status === "failed" ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
              <CardTitle className="text-base capitalize">
                {execution.status}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {execution.error?.Valid && (
              <p className="text-sm text-destructive">{execution.error.String}</p>
            )}
            {execution.output && (
              <pre className="rounded-md bg-muted p-4 text-xs overflow-auto max-h-64">
                {JSON.stringify(execution.output, null, 2)}
              </pre>
            )}
            <Button
              variant="link"
              size="sm"
              className="px-0 mt-2"
              onClick={() => router.push(`/executions/${execution.id}`)}
            >
              View full execution →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
