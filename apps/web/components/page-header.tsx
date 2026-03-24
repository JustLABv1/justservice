"use client"

import { ChevronRight } from "lucide-react"
import Link from "next/link"

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
    <header className="flex h-12 shrink-0 items-center gap-4 border-b px-4">
      <div className="flex flex-1 items-center gap-2 min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1
              return (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3 text-muted shrink-0" />}
                  {isLast ? (
                    <span className="font-medium truncate">{crumb.label}</span>
                  ) : (
                    <Link
                      href={crumb.href ?? "#"}
                      className="text-muted hover:text-foreground transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </span>
              )
            })}
          </nav>
        )}
        {title && !breadcrumbs?.length && (
          <h1 className="text-sm font-medium truncate">{title}</h1>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  )
}
