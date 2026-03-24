"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { createContext, useCallback, useContext, useState } from "react"
import { Button } from "@heroui/react"

interface SecondaryPanelContextValue {
  isOpen: boolean
  toggle: () => void
  open: () => void
  close: () => void
}

const SecondaryPanelContext = createContext<SecondaryPanelContextValue | null>(null)

export function useSecondaryPanel() {
  const ctx = useContext(SecondaryPanelContext)
  if (!ctx) throw new Error("useSecondaryPanel must be used within SecondaryPanelProvider")
  return ctx
}

export function SecondaryPanelProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true)

  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  return (
    <SecondaryPanelContext.Provider value={{ isOpen, toggle, open, close }}>
      {children}
    </SecondaryPanelContext.Provider>
  )
}

interface SecondaryPanelProps {
  title: string
  children: React.ReactNode
}

export function SecondaryPanel({ title, children }: SecondaryPanelProps) {
  const { isOpen, toggle } = useSecondaryPanel()

  return (
    <aside
      className={`shrink-0 border-r transition-[width] duration-200 ease-in-out overflow-hidden ${isOpen ? "w-60" : "w-0"}`}
    >
      <div className="flex h-full w-60 flex-col">
        <div className="flex h-12 items-center justify-between border-b px-3">
          <span className="text-sm font-medium">{title}</span>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={toggle}
            aria-label="Collapse panel"
            className="text-muted"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-3">{children}</div>
        </div>
      </div>
    </aside>
  )
}

export function SecondaryPanelToggle() {
  const { isOpen, toggle } = useSecondaryPanel()

  if (isOpen) return null

  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      onPress={toggle}
      aria-label="Open panel"
      className="text-muted"
    >
      <PanelLeftOpen className="size-4" />
    </Button>
  )
}
