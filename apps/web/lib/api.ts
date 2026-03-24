// Always use relative URLs so requests go through the Next.js proxy rewrite.
// This ensures cookies (e.g. refresh_token) are scoped to the frontend origin.
const API_BASE = ""

let accessToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      message = body.error || message
    } catch {}
    throw new ApiError(message, res.status)
  }
  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
    this.name = "ApiError"
  }
}

// Auth
export const auth = {
  login: (username: string, password: string) =>
    request<{ access_token: string; expires_in: number }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  register: (username: string, email: string, password: string) =>
    request<{ id: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    }),

  refresh: (signal?: AbortSignal) =>
    request<{ access_token: string; expires_in: number }>("/api/auth/refresh", {
      method: "POST",
      signal,
    }),

  logout: () =>
    request<void>("/api/auth/logout", { method: "POST" }),

  me: () =>
    request<{
      user: User
      roles: string[]
      permissions: string[]
    }>("/api/auth/me"),

  listOIDCProviders: () =>
    request<Array<{ id: string; name: string }>>("/api/auth/oidc/providers"),
}

// Tasks
export const tasks = {
  list: (q?: string) =>
    request<TaskDefinition[]>(`/api/tasks${q ? `?q=${encodeURIComponent(q)}` : ""}`),

  get: (slug: string) => request<TaskDefinition>(`/api/tasks/${encodeURIComponent(slug)}`),

  execute: (slug: string, input: Record<string, unknown>) =>
    request<Execution>(`/api/tasks/${encodeURIComponent(slug)}/execute`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
}

// Executions
export const executions = {
  list: () => request<Execution[]>("/api/executions"),
  get: (id: string) => request<Execution>(`/api/executions/${id}`),
  streamUrl: (id: string) => `${API_BASE}/api/executions/${id}/stream`,
}

// Admin
export const admin = {
  stats: () => request<AdminStats>("/api/admin/stats"),
  listExecutions: (status?: string) =>
    request<Execution[]>(`/api/admin/executions${status ? `?status=${status}` : ""}`),
  listUsers: () => request<User[]>("/api/admin/users"),
  listPlugins: () => request<Plugin[]>("/api/admin/plugins"),
  deregisterPlugin: (id: string) =>
    request<void>(`/api/admin/plugins/${id}`, { method: "DELETE" }),
  listRoles: () => request<Role[]>("/api/admin/roles"),
  listPermissions: () => request<Permission[]>("/api/admin/permissions"),
  listOidcProviders: () => request<OIDCProvider[]>("/api/admin/oidc"),
  createOIDCProvider: (data: {
    name: string
    issuer_url: string
    client_id: string
    client_secret: string
    scopes: string[]
    enabled: boolean
  }) =>
    request<{ id: string }>("/api/admin/oidc", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listAuditLog: () => request<AuditLog[]>("/api/admin/audit-log"),
}

// Types
export interface User {
  id: string
  username: string
  email: string
  is_active: boolean
  created_at: string
}

export interface TaskDefinition {
  id: string
  plugin_id: string
  plugin_name: string
  name: string
  slug: string
  description: string
  category: string
  input_schema: Record<string, unknown>
  is_sync: boolean
}

// sql.NullString serializes as { String, Valid } in Go
export interface NullString {
  String: string
  Valid: boolean
}

export interface Execution {
  id: string
  user_id: string
  task_definition_id: string
  task_slug: string
  task_name: string
  input: Record<string, unknown>
  output?: Record<string, unknown>
  status: "pending" | "running" | "completed" | "failed"
  error?: NullString
  started_at: string
  completed_at?: string
}

export interface Plugin {
  id: string
  name: string
  description: string
  grpc_address: string
  status: "healthy" | "unhealthy" | "unknown"
  registered_at: string
  last_heartbeat?: string
}

export interface Role {
  id: string
  name: string
  description: string
  is_system: boolean
}

export interface Permission {
  id: string
  name: string
  resource: string
  action: string
  description: string
}

export interface OIDCProvider {
  id: string
  name: string
  issuer_url: string
  client_id: string
  scopes: string[]
  enabled: boolean
}

export interface AuditLog {
  id: string
  user_id?: string
  action: string
  resource_type: string
  resource_id: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface AdminStats {
  total_users: number
  total_plugins: number
  total_tasks: number
  total_executions: number
  running_now: number
}


