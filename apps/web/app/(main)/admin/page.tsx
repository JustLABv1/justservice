"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import {
  Activity,
  CheckCircle,
  Loader2,
  Package,
  Shield,
  Users,
} from "lucide-react"
import { toast } from "@heroui/react"

import { Card, Chip, Skeleton, Table, cn } from "@heroui/react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
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
  { key: "executions", label: "Executions", icon: CheckCircle },
  { key: "users", label: "Users", icon: Users },
  { key: "plugins", label: "Plugins", icon: Package },
  { key: "roles", label: "Roles", icon: Shield },
] as const

type SectionKey = (typeof SECTIONS)[number]["key"]

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | undefined
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <Card.Content className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-accent/10 p-2">
          <Icon className="size-4 text-accent" />
        </div>
        <div>
          {value === undefined ? (
            <Skeleton className="h-6 w-10 mb-0.5" />
          ) : (
            <p className="text-xl font-bold tabular-nums">{value.toLocaleString()}</p>
          )}
          <p className="text-xs text-muted">{label}</p>
        </div>
      </Card.Content>
    </Card>
  )
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
  const [isLoadingSection, setIsLoadingSection] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!isAdmin) {
      toast.danger("You don't have permission to access the admin area.")
      router.replace("/tasks")
      return
    }
    admin
      .stats()
      .then(setStats)
      .catch(() => toast.danger("Failed to load stats"))
  }, [authLoading, isAdmin, router])

  async function loadSection(section: SectionKey) {
    setActiveSection(section)
    if (section === "dashboard") return
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
          actions={<SecondaryPanelToggle />}
        />

        <div className="flex-1 overflow-auto p-4">
          {activeSection === "dashboard" && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatCard label="Users" value={stats?.total_users} icon={Users} />
                <StatCard label="Plugins" value={stats?.total_plugins} icon={Package} />
                <StatCard label="Task types" value={stats?.total_tasks} icon={Activity} />
                <StatCard label="Executions" value={stats?.total_executions} icon={CheckCircle} />
                <StatCard label="Running" value={stats?.running_now} icon={Loader2} />
              </div>
            </div>
          )}

          {activeSection === "executions" && (
            <SectionTable isLoading={isLoadingSection}>
              <Table.ScrollContainer>
                <Table.Content aria-label="Executions">
                  <Table.Header>
                    <Table.Column>Task</Table.Column>
                    <Table.Column>User</Table.Column>
                    <Table.Column>Status</Table.Column>
                    <Table.Column>Started</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {executions.map((exec) => (
                      <Table.Row key={exec.id}>
                        <Table.Cell className="font-medium">{exec.task_slug}</Table.Cell>
                        <Table.Cell className="text-muted text-sm">{exec.user_id}</Table.Cell>
                        <Table.Cell>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={
                              exec.status === "completed"
                                ? "success"
                                : exec.status === "failed"
                                  ? "danger"
                                  : "default"
                            }
                          >
                            {exec.status}
                          </Chip>
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
                  <Table.Body>
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
                  </Table.Header>
                  <Table.Body>
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
                  <Table.Body>
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
  return <Table>{children}</Table>
}
