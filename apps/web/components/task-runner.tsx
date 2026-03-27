"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle, Loader2, Play, XCircle } from "lucide-react"
import { toast } from "@heroui/react"

import { Button, Chip, Description, Input, Label, Separator, Switch } from "@heroui/react"
import {
  executions as execApi,
  tasks as tasksApi,
  type Execution,
  type TaskDefinition,
} from "@/lib/api"

type JsonSchema = {
  properties?: Record<string, Record<string, unknown>>
}

function normalizeSchema(input: unknown): JsonSchema {
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input)
      return parsed && typeof parsed === "object" ? (parsed as JsonSchema) : {}
    } catch {
      return {}
    }
  }
  return input && typeof input === "object" ? (input as JsonSchema) : {}
}

function SchemaField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string
  schema: Record<string, unknown>
  value: unknown
  onChange: (val: unknown) => void
}) {
  const labelText = (schema.title as string) || name
  const description = schema.description as string | undefined
  const type = schema.type as string

  if (type === "boolean") {
    return (
      <Switch
        isSelected={value === true}
        onChange={(checked) => onChange(checked)}
        name={name}
      >
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>
          <Label className="text-sm font-medium">{labelText}</Label>
          {description && <Description className="text-xs">{description}</Description>}
        </Switch.Content>
      </Switch>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name} className="text-sm font-medium">
        {labelText}
        {!!schema.required && <span className="ml-1 text-danger">*</span>}
      </Label>
      <Input
        id={name}
        type={type === "integer" || type === "number" ? "number" : "text"}
        placeholder={description}
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        variant="secondary"
      />
      {description && (
        <p className="text-xs text-muted">{description}</p>
      )}
    </div>
  )
}

interface TaskRunnerProps {
  task: TaskDefinition
}

export function TaskRunner({ task }: TaskRunnerProps) {
  const router = useRouter()
  const [isExecuting, setIsExecuting] = useState(false)
  const [execution, setExecution] = useState<Execution | null>(null)
  const pollRef = useRef<number | null>(null)

  const properties = normalizeSchema(task.input_schema).properties ?? {}
  const hasFields = Object.keys(properties).length > 0

  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(() => {
    const schema = normalizeSchema(task.input_schema)
    const init: Record<string, unknown> = {}
    for (const [key, fieldSchema] of Object.entries(schema.properties ?? {})) {
      const s = fieldSchema as Record<string, unknown>
      if (s.type === "boolean") {
        init[key] = s.default !== undefined ? Boolean(s.default) : false
      }
    }
    return init
  })

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current)
      }
    }
  }, [])

  function buildInput(): Record<string, unknown> {
    const schema = normalizeSchema(task.input_schema)
    const result: Record<string, unknown> = {}
    for (const [key, fieldSchema] of Object.entries(schema.properties ?? {})) {
      const raw = fieldValues[key]
      const type = fieldSchema.type as string
      if (type === "integer") result[key] = parseInt(raw as string, 10)
      else if (type === "number") result[key] = parseFloat(raw as string)
      else if (type === "boolean") result[key] = typeof raw === "boolean" ? raw : raw === "true"
      else result[key] = raw ?? ""
    }
    return result
  }

  async function handleExecute(e: React.FormEvent) {
    e.preventDefault()
    setIsExecuting(true)
    try {
      const exec = await tasksApi.execute(task.slug, buildInput())
      setExecution(exec)
      if (exec.status === "pending" || exec.status === "running") {
        pollExecution(exec.id)
      } else {
        setIsExecuting(false)
      }
    } catch (err) {
      toast.danger(err instanceof Error ? err.message : "Execution failed")
      setIsExecuting(false)
    }
  }

  function pollExecution(id: string) {
    if (pollRef.current) {
      window.clearInterval(pollRef.current)
    }

    pollRef.current = window.setInterval(async () => {
      try {
        const exec = await execApi.get(id)
        setExecution(exec)
        if (exec.status === "completed" || exec.status === "failed") {
          if (pollRef.current) {
            window.clearInterval(pollRef.current)
            pollRef.current = null
          }
          setIsExecuting(false)
        }
      } catch {
        if (pollRef.current) {
          window.clearInterval(pollRef.current)
          pollRef.current = null
        }
        setIsExecuting(false)
      }
    }, 1500)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Task meta */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{task.name}</h2>
          <Chip
            size="sm"
            color={task.is_sync ? "accent" : "default"}
            variant="soft"
          >
            {task.is_sync ? "Sync" : "Async"}
          </Chip>
        </div>
        <p className="text-sm text-muted">{task.description}</p>
        <p className="text-xs text-muted">
          Plugin: {task.plugin_name} &middot; Category: {task.category || "General"}
        </p>
      </div>

      <Separator />

      {/* Form */}
      <form onSubmit={handleExecute} className="flex flex-col gap-4">
        {hasFields ? (
          <>
            <p className="text-sm font-medium">Parameters</p>
            {Object.entries(properties).map(([key, schema]) => (
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
          </>
        ) : (
          <p className="text-sm text-muted">
            This task requires no parameters.
          </p>
        )}
        <Button type="submit" isDisabled={isExecuting} className="w-full">
          {isExecuting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {isExecuting ? "Running…" : "Run task"}
        </Button>
      </form>

      {/* Result */}
      {execution && (
        <>
          <Separator />
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {execution.status === "completed" ? (
                <CheckCircle className="size-4 text-success" />
              ) : execution.status === "failed" ? (
                <XCircle className="size-4 text-danger" />
              ) : (
                <Loader2 className="size-4 animate-spin text-muted" />
              )}
              <span className="text-sm font-medium capitalize">{execution.status}</span>
            </div>
            {execution.error?.Valid && (
              <p className="text-sm text-danger">{execution.error.String}</p>
            )}
            {execution.output && (
              <pre className="max-h-80 overflow-auto rounded-lg bg-surface-secondary p-4 text-sm leading-6 font-mono">
                {JSON.stringify(execution.output, null, 2)}
              </pre>
            )}
            <button
              type="button"
              className="text-xs text-accent hover:underline self-start"
              onClick={() => router.push(`/executions/${execution.id}`)}
            >
              View full execution &rarr;
            </button>
          </div>
        </>
      )}
    </div>
  )
}
