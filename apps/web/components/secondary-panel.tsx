"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { createContext, useCallback, useContext, useState } from "react"
import { Button, Drawer } from "@heroui/react"
import { useIsMobile } from "@/hooks/use-mobile"

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

function PanelScaffold({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="flex h-full flex-col bg-background/95">
      <div className="flex h-14 items-center justify-between border-b border-default-200/80 px-3 sm:px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted">Filters and shortcuts</p>
        </div>
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={onClose}
          aria-label="Collapse panel"
          className="text-muted"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="p-3 sm:p-4">{children}</div>
      </div>
    </div>
  )
}

export function SecondaryPanel({ title, children }: SecondaryPanelProps) {
  const { isOpen, toggle, open, close } = useSecondaryPanel()
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Drawer>
        <Drawer.Backdrop
          isOpen={isOpen}
          onOpenChange={(nextOpen) => (nextOpen ? open() : close())}
          variant="blur"
        >
          <Drawer.Content placement="left">
            <Drawer.Dialog className="h-svh w-[min(20rem,calc(100vw-1rem))] rounded-none border-r border-default-200/80 bg-background/95 shadow-2xl shadow-black/10">
              <Drawer.Header className="sr-only">
                <Drawer.Heading>{title}</Drawer.Heading>
              </Drawer.Header>
              <Drawer.Body className="p-0">
                <PanelScaffold title={title} onClose={close}>
                  {children}
                </PanelScaffold>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      </Drawer>
    )
  }

  return (
    <aside
      className={`hidden shrink-0 border-r border-default-200/80 transition-[width] duration-200 ease-in-out overflow-hidden md:block ${isOpen ? "w-64" : "w-0"}`}
    >
      <div className="h-full w-64">
        <PanelScaffold title={title} onClose={toggle}>
          {children}
        </PanelScaffold>
      </div>
    </aside>
  )
}

export function SecondaryPanelToggle() {
  const { isOpen, toggle, open } = useSecondaryPanel()
  const isMobile = useIsMobile()

  if (!isMobile && isOpen) return null

  return (
    <Button
      isIconOnly
      size="sm"
      variant="ghost"
      onPress={isMobile ? toggle : open}
      aria-label={isMobile && isOpen ? "Close panel" : "Open panel"}
      className="text-muted"
    >
      {isMobile && isOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
    </Button>
  )
}
