"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import {
  Activity,
  CheckCircle2,
  Package,
  RefreshCw,
  Shield,
  Trash2,
  Users,
} from "lucide-react"
import { toast } from "@heroui/react"

import { AlertDialog, Button, Card, Chip, Label, ProgressBar, Skeleton, Table, cn } from "@heroui/react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import { ExecutionStatusChip } from "@/components/execution-detail"
import { PageHeader } from "@/components/page-header"
import { SecondaryPanel, SecondaryPanelToggle } from "@/components/secondary-panel"
import {
  admin,
  type AdminStats,
  type Execution,
  type Plugin,
  type Role,
  type User,
} from "@/lib/api"

const SECTIONS = [
  { key: "dashboard", label: "Dashboard", icon: Activity },
  { key: "executions", label: "Executions", icon: CheckCircle2 },
  { key: "users", label: "Users", icon: Users },
  { key: "plugins", label: "Plugins", icon: Package },
  { key: "roles", label: "Roles", icon: Shield },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

async function fetchAdminSnapshot() {
  const [stats, executions, users, plugins, roles] = await Promise.all([
    admin.stats(),
    admin.listExecutions(),
    admin.listUsers(),
    admin.listPlugins(),
    admin.listRoles(),
  ])

  return { stats, executions, users, plugins, roles }
}

function StatCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string
  value: number | string | undefined
  helper: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="overflow-hidden border border-default-200 bg-content1 shadow-sm">
      <Card.Content className="flex min-h-24 flex-col justify-between gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="rounded-xl bg-accent/10 p-2.5 text-accent">
            <Icon className="size-4.5" />
          </div>
          <Chip size="sm" variant="soft" color="accent">
            {label}
          </Chip>
        </div>
        <div className="space-y-1">
          {value === undefined ? (
            <Skeleton className="mb-1 h-7 w-20" />
          ) : (
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{typeof value === "number" ? value.toLocaleString() : value}</p>
          )}
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{helper}</p>
        </div>
      </Card.Content>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-56 rounded-[2rem]" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-[1.25rem]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
        <Skeleton className="h-80 rounded-[1.5rem]" />
        <div className="grid gap-4">
          <Skeleton className="h-40 rounded-[1.5rem]" />
          <Skeleton className="h-36 rounded-[1.5rem]" />
        </div>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="px-4 py-8 text-sm text-muted">{message}</div>
}

export default function AdminPage() {
  const { roles: userRoles, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const isAdmin = userRoles.includes("admin")

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [activeSection, setActiveSection] = useState<SectionKey>("dashboard")
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true)
  const [isLoadingSection, setIsLoadingSection] = useState(false)

  const usersById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.username])),
    [users]
  )

  useEffect(() => {
    if (authLoading) return
    if (!isAdmin) {
      toast.danger("You don't have permission to access the admin area.")
      router.replace("/tasks")
      return
    }

    setIsLoadingDashboard(true)
    fetchAdminSnapshot()
      .then((snapshot) => {
        setStats(snapshot.stats)
        setExecutions(snapshot.executions)
        setUsers(snapshot.users)
        setPlugins(snapshot.plugins)
        setRoles(snapshot.roles)
      })
      .catch(() => toast.danger("Failed to load admin overview"))
      .finally(() => setIsLoadingDashboard(false))
  }, [authLoading, isAdmin, router])

  async function refreshDashboard() {
    setIsLoadingDashboard(true)
    try {
      const snapshot = await fetchAdminSnapshot()
      setStats(snapshot.stats)
      setExecutions(snapshot.executions)
      setUsers(snapshot.users)
      setPlugins(snapshot.plugins)
      setRoles(snapshot.roles)
    } catch {
      toast.danger("Failed to refresh admin overview")
    } finally {
      setIsLoadingDashboard(false)
    }
  }

  async function loadSection(section: SectionKey, force = false) {
    setActiveSection(section)

    if (section === "dashboard") {
      if (force) {
        await refreshDashboard()
      }
      return
    }

    if (!force) {
      if (section === "executions" && executions.length > 0) return
      if (section === "users" && users.length > 0) return
      if (section === "plugins" && plugins.length > 0) return
      if (section === "roles" && roles.length > 0) return
    }

    setIsLoadingSection(true)
    try {
      switch (section) {
        case "executions":
          setExecutions(await admin.listExecutions())
          break
        case "users":
          setUsers(await admin.listUsers())
          break
        case "plugins":
          setPlugins(await admin.listPlugins())
          break
        case "roles":
          setRoles(await admin.listRoles())
          break
      }
    } catch {
      toast.danger(`Failed to load ${section}`)
    } finally {
      setIsLoadingSection(false)
    }
  }

  async function handleDeregisterPlugin(id: string) {
    try {
      await admin.deregisterPlugin(id)
      setPlugins((prev) => prev.filter((p) => p.id !== id))
      toast.success("Plugin deregistered")
    } catch {
      toast.danger("Failed to deregister plugin")
    }
  }

  const totalPlugins = stats?.total_plugins ?? plugins.length
  const healthyPlugins = stats?.healthy_plugins ?? plugins.filter((plugin) => plugin.status === "healthy").length
  const unhealthyPlugins = stats?.unhealthy_plugins ?? Math.max(totalPlugins - healthyPlugins, 0)
  const successfulLast24h = stats?.completed_last_24h ?? 0
  const failedLast24h = stats?.failed_last_24h ?? 0
  const recentExecutionWindow = successfulLast24h + failedLast24h
  const successRate = recentExecutionWindow > 0 ? Math.round((successfulLast24h / recentExecutionWindow) * 100) : 100
  const pluginHealthRate = totalPlugins > 0 ? Math.round((healthyPlugins / totalPlugins) * 100) : 100
  const recentExecutions = executions.slice(0, 6)
  const newestUsers = users.slice(0, 5)
  const pluginAlerts = plugins.filter((plugin) => plugin.status !== "healthy").slice(0, 4)
  const adminTone = unhealthyPlugins > 0 || failedLast24h > 0 ? "warning" : "success"
  const adminHeadline = unhealthyPlugins > 0
    ? `${unhealthyPlugins} plugin${unhealthyPlugins === 1 ? " is" : "s are"} degraded`
    : failedLast24h > 0
      ? `${failedLast24h} failed execution${failedLast24h === 1 ? "" : "s"} in the last 24h`
      : "System looks healthy"

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Secondary Panel — Section Nav */}
      <SecondaryPanel title="Administration">
        <nav className="flex flex-col gap-0.5">
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                activeSection === key
                  ? "bg-accent/10 text-accent font-medium"
                  : "text-muted hover:bg-surface-secondary"
              )}
              onClick={() => loadSection(key)}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
      </SecondaryPanel>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader
          breadcrumbs={[
            { label: "Admin" },
            ...(activeSection !== "dashboard"
              ? [{ label: SECTIONS.find((s) => s.key === activeSection)!.label }]
              : []),
          ]}
          actions={(
            <>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => void (activeSection === "dashboard" ? refreshDashboard() : loadSection(activeSection, true))}
              >
                <RefreshCw className="size-4" />
                Refresh
              </Button>
              <SecondaryPanelToggle />
            </>
          )}
        />

        <div className="flex-1 overflow-auto p-4">
          {activeSection === "dashboard" && (
            isLoadingDashboard && !stats ? (
              <DashboardSkeleton />
            ) : (
              <div className="flex flex-col gap-6">
                <Card className="overflow-hidden border border-default-200 bg-content1 shadow-sm">
                  <Card.Content className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip size="sm" variant="soft" color={adminTone}>
                          {adminHeadline}
                        </Chip>
                        <Chip size="sm" variant="soft" color="accent">
                          {stats?.running_now ?? 0} running now
                        </Chip>
                      </div>

                      <div className="space-y-2">
                        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                          Administration cockpit
                        </h2>
                        <p className="max-w-2xl text-sm leading-6 text-muted">
                          Watch plugin health, execution reliability, and account growth from one place instead of drilling into every section.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[1.5rem] border border-default-200 bg-default-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Plugin posture</p>
                          <p className="mt-2 text-2xl font-semibold tabular-nums">{healthyPlugins}/{totalPlugins}</p>
                          <p className="mt-1 text-sm text-muted">healthy services available to users</p>
                        </div>
                        <div className="rounded-[1.5rem] border border-default-200 bg-default-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Executions 24h</p>
                          <p className="mt-2 text-2xl font-semibold tabular-nums">{(successfulLast24h + failedLast24h).toLocaleString()}</p>
                          <p className="mt-1 text-sm text-muted">recent completed and failed runs</p>
                        </div>
                        <div className="rounded-[1.5rem] border border-default-200 bg-default-50/70 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Active accounts</p>
                          <p className="mt-2 text-2xl font-semibold tabular-nums">{(stats?.active_users ?? 0).toLocaleString()}</p>
                          <p className="mt-1 text-sm text-muted">enabled users currently allowed to sign in</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 self-start">
                      <Card variant="secondary" className="border border-default-200 shadow-none">
                        <Card.Header className="pb-3">
                          <Card.Title>Execution reliability</Card.Title>
                          <Card.Description>Completed vs failed runs over the last 24 hours.</Card.Description>
                        </Card.Header>
                        <Card.Content className="gap-4">
                          <ProgressBar value={successRate} color={failedLast24h > 0 ? "warning" : "success"}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <Label>Success rate</Label>
                              <ProgressBar.Output />
                            </div>
                            <ProgressBar.Track>
                              <ProgressBar.Fill />
                            </ProgressBar.Track>
                          </ProgressBar>
                          <div className="flex items-center justify-between text-sm text-muted">
                            <span>{successfulLast24h.toLocaleString()} completed</span>
                            <span>{failedLast24h.toLocaleString()} failed</span>
                          </div>
                        </Card.Content>
                      </Card>

                      <Card variant="secondary" className="border border-default-200 shadow-none">
                        <Card.Header className="pb-3">
                          <Card.Title>Plugin health</Card.Title>
                          <Card.Description>Healthy services compared to total registered plugins.</Card.Description>
                        </Card.Header>
                        <Card.Content className="gap-4">
                          <ProgressBar value={pluginHealthRate} color={unhealthyPlugins > 0 ? "warning" : "accent"}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <Label>Healthy coverage</Label>
                              <ProgressBar.Output />
                            </div>
                            <ProgressBar.Track>
                              <ProgressBar.Fill />
                            </ProgressBar.Track>
                          </ProgressBar>
                          <div className="flex items-center justify-between text-sm text-muted">
                            <span>{healthyPlugins.toLocaleString()} healthy</span>
                            <span>{unhealthyPlugins.toLocaleString()} degraded</span>
                          </div>
                        </Card.Content>
                      </Card>
                    </div>
                  </Card.Content>
                </Card>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Users" helper="registered accounts" value={stats?.total_users} icon={Users} />
                  <StatCard label="Roles" helper="rbac definitions" value={stats?.total_roles} icon={Shield} />
                  <StatCard label="Task types" helper="available task templates" value={stats?.total_tasks} icon={Activity} />
                  <StatCard label="Executions" helper="total recorded runs" value={stats?.total_executions} icon={CheckCircle2} />
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)]">
                  <Card className="border border-default-200 bg-content1 shadow-sm">
                    <Card.Header className="pb-2">
                      <Card.Title>Recent executions</Card.Title>
                      <Card.Description>The latest task activity across all users.</Card.Description>
                    </Card.Header>
                    <Card.Content className="p-0">
                      <Table variant="secondary">
                        <Table.ScrollContainer>
                          <Table.Content
                            aria-label="Recent executions"
                            onRowAction={(key) => router.push(`/executions/${String(key)}`)}
                            className="[&_tr]:cursor-pointer"
                          >
                            <Table.Header>
                              <Table.Column>Task</Table.Column>
                              <Table.Column>Status</Table.Column>
                              <Table.Column>User</Table.Column>
                              <Table.Column>Started</Table.Column>
                            </Table.Header>
                            <Table.Body renderEmptyState={() => <EmptyState message="No executions recorded yet." />}>
                              {recentExecutions.map((exec) => (
                                <Table.Row key={exec.id}>
                                  <Table.Cell className="font-medium">{exec.task_name || exec.task_slug}</Table.Cell>
                                  <Table.Cell>
                                    <ExecutionStatusChip status={exec.status} />
                                  </Table.Cell>
                                  <Table.Cell className="max-w-48 truncate text-sm text-muted">
                                    {usersById[exec.user_id] ?? exec.user_id.slice(0, 8) + "…"}
                                  </Table.Cell>
                                  <Table.Cell className="text-sm text-muted">
                                    {format(new Date(exec.started_at), "MMM d, HH:mm")}
                                  </Table.Cell>
                                </Table.Row>
                              ))}
                            </Table.Body>
                          </Table.Content>
                        </Table.ScrollContainer>
                      </Table>
                    </Card.Content>
                  </Card>

                  <div className="grid gap-4">
                    <Card className="border border-default-200 bg-content1 shadow-sm">
                      <Card.Header className="pb-2">
                        <Card.Title>Plugin watchlist</Card.Title>
                        <Card.Description>Anything outside healthy status is surfaced here.</Card.Description>
                      </Card.Header>
                      <Card.Content className="gap-3">
                        {pluginAlerts.length > 0 ? (
                          pluginAlerts.map((plugin) => (
                            <div key={plugin.id} className="flex items-start justify-between gap-3 rounded-[1.25rem] border border-default-200 bg-default-50/70 p-4">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{plugin.name}</p>
                                <p className="truncate text-xs text-muted">{plugin.grpc_address}</p>
                              </div>
                              <Chip size="sm" variant="soft" color="warning">
                                {plugin.status}
                              </Chip>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-[1.25rem] border border-success/20 bg-success/5 p-4 text-sm text-success">
                            All registered plugins are currently healthy.
                          </div>
                        )}
                      </Card.Content>
                    </Card>

                    <Card className="border border-default-200 bg-content1 shadow-sm">
                      <Card.Header className="pb-2">
                        <Card.Title>Newest users</Card.Title>
                        <Card.Description>Recently created accounts and activation state.</Card.Description>
                      </Card.Header>
                      <Card.Content className="gap-3">
                        {newestUsers.length > 0 ? (
                          newestUsers.map((user) => (
                            <div key={user.id} className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-default-200 bg-default-50/70 p-4">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{user.username}</p>
                                <p className="truncate text-xs text-muted">{user.email}</p>
                              </div>
                              <div className="text-right">
                                <Chip size="sm" variant="soft" color={user.is_active ? "success" : "default"}>
                                  {user.is_active ? "Active" : "Inactive"}
                                </Chip>
                                <p className="mt-2 text-xs text-muted">{format(new Date(user.created_at), "MMM d")}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <EmptyState message="No users created yet." />
                        )}
                      </Card.Content>
                    </Card>
                  </div>
                </div>
              </div>
            )
          )}

          {activeSection === "executions" && (
            <SectionTable isLoading={isLoadingSection}>
              <Table.ScrollContainer>
                <Table.Content
                  aria-label="Executions"
                  onRowAction={(key) => router.push(`/executions/${String(key)}`)}
                  className="[&_tr]:cursor-pointer"
                >
                  <Table.Header>
                    <Table.Column>Task</Table.Column>
                    <Table.Column>User</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column>Started</Table.Column>
                  </Table.Header>
                  <Table.Body renderEmptyState={() => <EmptyState message="No executions recorded yet." />}>
                    {executions.map((exec) => (
                      <Table.Row key={exec.id}>
                        <Table.Cell className="font-medium">{exec.task_name || exec.task_slug}</Table.Cell>
                        <Table.Cell className="text-muted text-sm">
                          {usersById[exec.user_id] ?? exec.user_id.slice(0, 8) + "…"}
                        </Table.Cell>
                        <Table.Cell>
                          <ExecutionStatusChip status={exec.status} />
                        </Table.Cell>
                        <Table.Cell className="text-muted text-sm">
                          {exec.started_at
                            ? format(new Date(exec.started_at), "MMM d, HH:mm")
                            : "—"}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </SectionTable>
          )}

          {activeSection === "users" && (
            <SectionTable isLoading={isLoadingSection}>
              <Table.ScrollContainer>
                <Table.Content aria-label="Users">
                  <Table.Header>
                    <Table.Column>Username</Table.Column>
                    <Table.Column>Email</Table.Column>
                    <Table.Column>Active</Table.Column>
                    <Table.Column>Created</Table.Column>
                  </Table.Header>
                  <Table.Body renderEmptyState={() => <EmptyState message="No users available." />}>
                    {users.map((user) => (
                      <Table.Row key={user.id}>
                        <Table.Cell className="font-medium">{user.username}</Table.Cell>
                        <Table.Cell className="text-muted text-sm">{user.email}</Table.Cell>
                        <Table.Cell>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={user.is_active ? "success" : "default"}
                          >
                            {user.is_active ? "Active" : "Inactive"}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className="text-muted text-sm">
                          {format(new Date(user.created_at), "MMM d, yyyy")}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </SectionTable>
          )}

          {activeSection === "plugins" && (
            <SectionTable isLoading={isLoadingSection}>
              <Table.ScrollContainer>
                <Table.Content aria-label="Plugins">
                  <Table.Header>
                    <Table.Column>Name</Table.Column>
                    <Table.Column>Address</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column>Last Seen</Table.Column>
                    <Table.Column>Actions</Table.Column>
                  </Table.Header>
                  <Table.Body renderEmptyState={() => <EmptyState message="No plugins registered." />}>
                    {plugins.map((plugin) => (
                      <Table.Row key={plugin.id}>
                        <Table.Cell className="font-medium">{plugin.name}</Table.Cell>
                        <Table.Cell className="text-muted text-sm">{plugin.grpc_address}</Table.Cell>
                        <Table.Cell>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={plugin.status === "healthy" ? "success" : "danger"}
                          >
                            {plugin.status}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className="text-muted text-sm">
                          {plugin.last_heartbeat
                            ? format(new Date(plugin.last_heartbeat), "MMM d, HH:mm")
                            : "—"}
                        </Table.Cell>
                        <Table.Cell>
                          <AlertDialog>
                            <Button
                              variant="ghost"
                              isIconOnly
                              size="sm"
                              aria-label="Deregister plugin"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="size-4 text-muted" />
                            </Button>
                            <AlertDialog.Backdrop>
                              <AlertDialog.Container>
                                <AlertDialog.Dialog className="sm:max-w-[400px]">
                                  <AlertDialog.CloseTrigger />
                                  <AlertDialog.Header>
                                    <AlertDialog.Icon status="danger" />
                                    <AlertDialog.Heading>Deregister plugin?</AlertDialog.Heading>
                                  </AlertDialog.Header>
                                  <AlertDialog.Body>
                                    <p>
                                      This will remove <strong>{plugin.name}</strong> from the registry.
                                      It will re-register automatically if the plugin process is still running.
                                    </p>
                                  </AlertDialog.Body>
                                  <AlertDialog.Footer>
                                    <Button slot="close" variant="tertiary">
                                      Cancel
                                    </Button>
                                    <Button
                                      slot="close"
                                      variant="danger"
                                      onPress={() => handleDeregisterPlugin(plugin.id)}
                                    >
                                      Deregister
                                    </Button>
                                  </AlertDialog.Footer>
                                </AlertDialog.Dialog>
                              </AlertDialog.Container>
                            </AlertDialog.Backdrop>
                          </AlertDialog>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </SectionTable>
          )}

          {activeSection === "roles" && (
            <SectionTable isLoading={isLoadingSection}>
              <Table.ScrollContainer>
                <Table.Content aria-label="Roles">
                  <Table.Header>
                    <Table.Column>Role</Table.Column>
                    <Table.Column>Description</Table.Column>
                    <Table.Column>Type</Table.Column>
                  </Table.Header>
                  <Table.Body renderEmptyState={() => <EmptyState message="No roles configured." />}>
                    {roles.map((role) => (
                      <Table.Row key={role.id}>
                        <Table.Cell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Shield className="size-4 text-muted" />
                            {role.name}
                          </div>
                        </Table.Cell>
                        <Table.Cell className="text-muted text-sm">{role.description}</Table.Cell>
                        <Table.Cell>
                          <Chip size="sm" variant="soft" color={role.is_system ? "accent" : "default"}>
                            {role.is_system ? "System" : "Custom"}
                          </Chip>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </SectionTable>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionTable({
  isLoading,
  children,
}: {
  isLoading: boolean
  children: React.ReactNode
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-px">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    )
  }
  return (
    <Card className="border border-default-200 bg-content1 shadow-sm">
      <Card.Content className="p-0">
        <Table variant="secondary">{children}</Table>
      </Card.Content>
    </Card>
  )
}
