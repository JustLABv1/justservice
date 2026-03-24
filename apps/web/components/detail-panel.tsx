"use client"

import { X } from "lucide-react"
import { createContext, useCallback, useContext, useState } from "react"
import { Button } from "@heroui/react"

interface DetailPanelState {
  content: React.ReactNode | null
  title: string
}

interface DetailPanelContextValue {
  isOpen: boolean
  state: DetailPanelState
  openDetail: (title: string, content: React.ReactNode) => void
  closeDetail: () => void
}

const DetailPanelContext = createContext<DetailPanelContextValue | null>(null)

export function useDetailPanel() {
  const ctx = useContext(DetailPanelContext)
  if (!ctx) throw new Error("useDetailPanel must be used within DetailPanelProvider")
  return ctx
}

export function DetailPanelProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DetailPanelState>({ content: null, title: "" })

  const openDetail = useCallback((title: string, content: React.ReactNode) => {
    setState({ title, content })
  }, [])

  const closeDetail = useCallback(() => {
    setState({ content: null, title: "" })
  }, [])

  const isOpen = state.content !== null

  return (
    <DetailPanelContext.Provider value={{ isOpen, state, openDetail, closeDetail }}>
      {children}
    </DetailPanelContext.Provider>
  )
}

export function DetailPanel() {
  const { isOpen, state, closeDetail } = useDetailPanel()

  return (
    <aside
      className={`shrink-0 border-l transition-[width] duration-200 ease-in-out overflow-hidden ${isOpen ? "w-[400px]" : "w-0"}`}
    >
      <div className="flex h-full w-[400px] flex-col">
        <div className="flex h-12 items-center justify-between border-b px-4">
          <span className="text-sm font-medium truncate">{state.title}</span>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={closeDetail}
            aria-label="Close"
            className="shrink-0 text-muted"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="p-4">{state.content}</div>
        </div>
      </div>
    </aside>
  )
}
