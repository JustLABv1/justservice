"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowUpRight, Check, CheckCircle, Copy, Loader2, Play, RotateCcw, XCircle } from "lucide-react"
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

function isCredentialField(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return (
    normalized.includes("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("token") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("privatekey") ||
    normalized === "authorization" ||
    normalized.endsWith("keyid")
  )
}

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "")
  return (
    normalized.includes("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("token") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("privatekey") ||
    normalized === "authorization"
  )
}

function collectSecretValues(value: unknown, out: string[] = []): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return out
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key) && typeof val === "string" && val) {
      out.push(val)
    } else {
      collectSecretValues(val, out)
    }
  }
  return out
}

function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveFields)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : redactSensitiveFields(item),
      ])
    )
  }
  return value
}

function redactOutputJson(output: unknown): string {
  const secrets = collectSecretValues(output)
  let json = JSON.stringify(redactSensitiveFields(output), null, 2)
  for (const secret of secrets) {
    if (!secret) continue
    // Match the JSON-encoded form of the secret (without surrounding quotes) so
    // that special characters (backslashes, unicode escapes, etc.) are handled
    // correctly — this also catches the value embedded inside array strings.
    const jsonEncoded = JSON.stringify(secret).slice(1, -1)
    json = json.split(jsonEncoded).join("[REDACTED]")
  }
  return json
}

function extractSensitiveFields(
  value: unknown,
  label = ""
): { label: string; value: string }[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const results: { label: string; value: string }[] = []
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (isCredentialField(key) && typeof val === "string") {
      results.push({ label: label ? `${label} › ${key}` : key, value: val })
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      results.push(...extractSensitiveFields(val, label ? `${label} › ${key}` : key))
    }
  }
  return results
}

function SensitiveCredentials({ fields }: { fields: { label: string; value: string }[] }) {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(value: string, label: string) {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(label)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-warning">
        <AlertTriangle className="size-4 shrink-0" />
        <span className="text-sm font-medium">Save these credentials — they won't be shown again</span>
      </div>
      <div className="flex flex-col gap-2">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-xs text-muted font-mono">{label}</span>
            <div className="group flex items-center gap-2">
              <code className="flex-1 rounded bg-surface-secondary px-3 py-1.5 font-mono text-sm break-all select-all">
                {value}
              </code>
              <Button
                isIconOnly
                variant="ghost"
                size="sm"
                onPress={() => copy(value, label)}
                aria-label={`Copy ${label}`}
                className="shrink-0"
              >
                {copied === label ? (
                  <Check className="size-3.5 text-success" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
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
  const [outputCopied, setOutputCopied] = useState(false)
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

  const isTerminal = execution?.status === "completed" || execution?.status === "failed"

  function copyOutput() {
    if (!execution?.output) return
    navigator.clipboard.writeText(JSON.stringify(execution.output, null, 2))
    setOutputCopied(true)
    setTimeout(() => setOutputCopied(false), 2000)
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
            <div className="flex items-center justify-between">
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
              {isTerminal && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => setExecution(null)}
                >
                  <RotateCcw className="size-3.5" />
                  Run again
                </Button>
              )}
            </div>
            {execution.error?.Valid && (
              <p className="text-sm text-danger">{execution.error.String}</p>
            )}
            {execution.output && (() => {
              const sensitiveFields = extractSensitiveFields(execution.output)
              return (
                <div className="flex flex-col gap-3">
                  {sensitiveFields.length > 0 && (
                    <SensitiveCredentials fields={sensitiveFields} />
                  )}
                  <div className="group relative">
                    <pre className="max-h-80 overflow-auto rounded-lg bg-surface-secondary p-4 text-sm leading-6 font-mono">
                      {redactOutputJson(execution.output)}
                    </pre>
                    <Button
                      isIconOnly
                      variant="ghost"
                      size="sm"
                      onPress={copyOutput}
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Copy output"
                    >
                      {outputCopied ? (
                        <Check className="size-3.5 text-success" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              )
            })()}
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onPress={() => router.push(`/executions/${execution.id}`)}
            >
              View full execution
              <ArrowUpRight data-icon="inline-end" />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
