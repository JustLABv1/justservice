"use client"

import { DetailPanel, DetailPanelProvider } from "@/components/detail-panel"
import { AppSidebar } from "@/components/sidebar"
import { SecondaryPanelProvider } from "@/components/secondary-panel"

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <SecondaryPanelProvider>
      <DetailPanelProvider>
        <div className="flex h-svh w-full overflow-hidden">
          <AppSidebar />
          <div className="flex flex-1 overflow-hidden">
            {children}
          </div>
          <DetailPanel />
        </div>
      </DetailPanelProvider>
    </SecondaryPanelProvider>
  )
}
