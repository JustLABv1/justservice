"use client"

import type { TaskDefinition } from "@/lib/api"

interface TaskContextMenuProps {
  task: TaskDefinition
  children: React.ReactNode
}

// HeroUI has no ContextMenu — right-click menus are handled by inline action buttons
export function TaskContextMenu({ children }: TaskContextMenuProps) {
  return <>{children}</>
}
