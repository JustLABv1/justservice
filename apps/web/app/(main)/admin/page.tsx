"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import {
  Activity,
  CheckCircle,
  Globe,
  Loader2,
  Package,
  Shield,
  Users,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth-provider"
import {
  admin,
  type AdminStats,
  type Execution,
  type Plugin,
  type Role,
  type User,
} from "@/lib/api"

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
      <CardContent className="flex items-center gap-4 pt-6">
        <div className="rounded-full bg-primary/10 p-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          {value === undefined ? (
            <Skeleton className="h-7 w-12 mb-1" />
          ) : (
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
          )}
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
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
  const [activeTab, setActiveTab] = useState("executions")
  const [isLoadingTab, setIsLoadingTab] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!isAdmin) {
      toast.error("You don't have permission to access the admin area.")
      router.replace("/tasks")
      return
    }
    admin
      .stats()
      .then(setStats)
      .catch(() => toast.error("Failed to load stats"))
  }, [authLoading, isAdmin, router])

  async function loadTab(tab: string) {
    setActiveTab(tab)
    setIsLoadingTab(true)
    try {
      switch (tab) {
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
      toast.error(`Failed to load ${tab}`)
    } finally {
      setIsLoadingTab(false)
    }
  }

  // Load default tab
  useEffect(() => {
    if (!isAdmin) return
    loadTab("executions")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Users" value={stats?.total_users} icon={Users} />
        <StatCard label="Plugins" value={stats?.total_plugins} icon={Package} />
        <StatCard
          label="Task types"
          value={stats?.total_tasks}
          icon={Activity}
        />
        <StatCard
          label="Executions"
          value={stats?.total_executions}
          icon={CheckCircle}
        />
        <StatCard label="Running" value={stats?.running_now} icon={Loader2} />
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={loadTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="plugins">Plugins</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        {/* Executions */}
        <TabsContent value="executions">
          <Card>
            <CardContent className="p-0">
              {isLoadingTab ? (
                <div className="space-y-px p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executions.map((exec) => (
                      <TableRow key={exec.id}>
                        <TableCell className="font-medium">
                          {exec.task_slug}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {exec.user_id}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              exec.status === "completed"
                                ? "default"
                                : exec.status === "failed"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {exec.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {exec.started_at
                            ? format(
                                new Date(exec.started_at),
                                "MMM d, HH:mm"
                              )
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users">
          <Card>
            <CardContent className="p-0">
              {isLoadingTab ? (
                <div className="space-y-px p-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.username}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={user.is_active ? "default" : "secondary"}
                          >
                            {user.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {format(new Date(user.created_at), "MMM d, yyyy")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plugins */}
        <TabsContent value="plugins">
          <Card>
            <CardContent className="p-0">
              {isLoadingTab ? (
                <div className="space-y-px p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plugins.map((plugin) => (
                      <TableRow key={plugin.id}>
                        <TableCell className="font-medium">
                          {plugin.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {plugin.grpc_address}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              plugin.status === "healthy" ? "default" : "destructive"
                            }
                            className={
                              plugin.status === "healthy"
                                ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                                : ""
                            }
                          >
                            {plugin.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {plugin.last_heartbeat
                            ? format(new Date(plugin.last_heartbeat), "MMM d, HH:mm")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Roles */}
        <TabsContent value="roles">
          <Card>
            <CardContent className="p-0">
              {isLoadingTab ? (
                <div className="space-y-px p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead>Permissions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => (
                      <TableRow key={role.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            {role.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {/* Roles are separate entities without embedded permissions */}
                            {role.name}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
