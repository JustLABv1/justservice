"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Home,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Sun,
} from "lucide-react"
import { Avatar, Button, Dropdown, Label, Separator } from "@heroui/react"
import { useAuth } from "@/components/auth-provider"

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/tasks", label: "Tasks", icon: LayoutDashboard },
  { href: "/executions", label: "Executions", icon: Activity },
]

const ADMIN_ITEMS = [
  { href: "/admin", label: "Admin", icon: Settings },
]

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, roles, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const isAdmin = roles.includes("admin")

  const initials = user ? user.username.slice(0, 2).toUpperCase() : "?"

  async function handleLogout() {
    await logout()
    router.push("/login")
  }

  function isActive(href: string) {
    if (href === "/") return pathname === "/"
    if (href === "/tasks") return pathname === "/tasks" || pathname.startsWith("/tasks/")
    return pathname.startsWith(href)
  }

  const navItemClass = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
      active
        ? "bg-accent/10 text-accent font-medium"
        : "text-muted hover:bg-surface-secondary hover:text-foreground"
    } ${collapsed ? "justify-center px-0 w-9 mx-auto" : ""}`

  return (
    <aside
      className={`flex flex-col shrink-0 border-r transition-[width] duration-200 ease-in-out overflow-hidden ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      {/* Header */}
      <div className="flex h-14 items-center border-b px-3">
        {collapsed ? (
          <button
            className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground text-xs font-bold"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
          >
            JS
          </button>
        ) : (
          <>
            <Link
              href="/"
              className="flex flex-1 items-center gap-2.5 font-semibold text-sm"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground text-xs font-bold">
                JS
              </div>
              JustService
            </Link>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              onPress={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="shrink-0 text-muted"
            >
              <ChevronLeft className="size-4" />
            </Button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
        {!collapsed && (
          <p className="px-2.5 py-1 text-xs font-medium text-muted">Navigation</p>
        )}
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={navItemClass(isActive(item.href))}>
            <item.icon className="size-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}

        {isAdmin && (
          <>
            <Separator className="my-2" />
            {!collapsed && (
              <p className="px-2.5 py-1 text-xs font-medium text-muted">Administration</p>
            )}
            {ADMIN_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={navItemClass(isActive(item.href))}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Footer */}
        <Separator className="mb-2" />

        {/* Theme toggle */}
        <Button
          isIconOnly={collapsed}
          size="sm"
          variant="ghost"
          onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          className={`text-muted ${collapsed ? "mx-auto" : "w-full justify-start gap-2.5 px-2.5"}`}
        >
          <Sun className="size-4 shrink-0 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 shrink-0 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          {!collapsed && <span className="ml-6">Toggle theme</span>}
        </Button>

        {/* User dropdown */}
        <Dropdown>
          <Dropdown.Trigger
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-surface-secondary cursor-pointer ${
              collapsed ? "justify-center px-0" : ""
            }`}
          >
            <Avatar size="sm" className="shrink-0">
              <Avatar.Fallback className="text-xs font-medium">{initials}</Avatar.Fallback>
            </Avatar>
            {!collapsed && (
              <span className="truncate text-sm font-medium">{user?.username ?? "Account"}</span>
            )}
            {!collapsed && <ChevronRight className="ml-auto size-3.5 text-muted shrink-0" />}
          </Dropdown.Trigger>
          <Dropdown.Popover className="min-w-[200px]">
            <div className="px-3 pt-3 pb-1">
              <p className="text-sm font-medium">{user?.username}</p>
              <p className="text-xs text-muted">{user?.email}</p>
            </div>
            <Dropdown.Menu
              onAction={(key) => {
                if (key === "logout") handleLogout()
              }}
            >
              <Dropdown.Item id="logout" textValue="Sign out" variant="danger">
                <LogOut className="size-4 text-danger" />
                <Label>Sign out</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </nav>
    </aside>
  )
}
