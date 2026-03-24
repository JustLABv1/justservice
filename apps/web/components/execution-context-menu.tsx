"use client"

import type { Execution } from "@/lib/api"

interface ExecutionContextMenuProps {
  execution: Execution
  children: React.ReactNode
}

// HeroUI has no ContextMenu — actions are handled via row onClick and inline buttons
export function ExecutionContextMenu({ children }: ExecutionContextMenuProps) {
  return <>{children}</>
}
