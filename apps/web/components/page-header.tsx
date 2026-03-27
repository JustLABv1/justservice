"use client"

import { Breadcrumbs } from "@heroui/react"
import { ChevronRight } from "lucide-react"

export interface BreadcrumbEntry {
  label: string
  href?: string
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbEntry[]
  title?: string
  actions?: React.ReactNode
}

export function PageHeader({ breadcrumbs, title, actions }: PageHeaderProps) {
  return (
    <header className="shrink-0 border-b border-default-200/80 bg-background/70 backdrop-blur-sm">
      <div className="flex min-h-14 items-center gap-3 px-4 sm:px-5">
        <div className="min-w-0 flex flex-1 items-center gap-2">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs
            separator={<ChevronRight className="size-3 text-muted" />}
            className="min-w-0 text-sm"
          >
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1
              return (
                <Breadcrumbs.Item
                  key={`${crumb.label}-${i}`}
                  href={isLast ? undefined : crumb.href}
                  className={isLast ? "max-w-[16rem] truncate font-medium text-foreground" : "max-w-[12rem] truncate text-muted transition-colors hover:text-foreground"}
                >
                  <span className="truncate">{crumb.label}</span>
                </Breadcrumbs.Item>
              )
            })}
          </Breadcrumbs>
        )}
        {title && !breadcrumbs?.length && (
          <h1 className="truncate text-sm font-medium text-foreground">{title}</h1>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
          {actions}
        </div>
      )}
      </div>
    </header>
  )
}
