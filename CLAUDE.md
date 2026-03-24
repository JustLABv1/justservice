# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend development (repo root delegates to apps/web)
pnpm dev          # Start the Next.js app (Turbopack)
pnpm build        # Build the Next.js app
pnpm lint         # Lint the frontend
pnpm typecheck    # Type-check the frontend
pnpm format       # Format the frontend

# Add a shadcn component (run from repo root)
pnpm dlx shadcn@latest add <component> -c apps/web

# Go API (from apps/api/)
go run ./cmd/server        # Run API server directly
go build -o bin/api ./cmd/server  # Build binary
go vet ./...               # Vet Go code

# Full local stack (PostgreSQL + API + web + example plugins)
docker-compose up          # Start all services
docker-compose up -d api   # Start only API + database
```

## Architecture

JustService is a self-service task execution platform. Users browse and run "tasks" (defined by plugins) through a web UI. The system uses RBAC for access control and supports both OIDC federation and local auth.

### Monorepo structure

**`apps/web`** — Next.js 16 app (App Router, React 19, Turbopack). App-local code lives in `components/`, `hooks/`, and `lib/`. The `components/theme-provider.tsx` wraps the app with `next-themes` and wires a `d` hotkey for dark/light toggle.

**`apps/api`** — Go 1.26 REST + gRPC backend. HTTP on port 8080, gRPC on port 9090. Chi router, PostgreSQL via sqlx, zerolog for structured logging, viper for config.

**`plugins/`** — Go plugin binaries. Each plugin is a standalone gRPC server that registers itself with the API on startup. The `plugins/sdk/` package provides the base `Handler` interface.

### Frontend conventions

- All pages under `app/(main)/` require auth; `app/(auth)/` routes are public.
- `components/auth-provider.tsx` manages auth state via React context — exposes `useAuth()` for token, user, roles, and permission checks. Tokens live in memory only; session is restored via `/api/auth/refresh` on mount.
- `lib/api.ts` is the centralized API client. All typed request/response interfaces and endpoint functions live there.
- Every page component uses `"use client"` — there are no React Server Components in use.

**CSS/Tailwind:** Tailwind v4 is configured directly in the frontend app. There is no `tailwind.config.*` file — configuration is CSS-first.

**shadcn style:** `radix-nova` with `neutral` base color, CSS variables enabled, Lucide icons.

**Path aliases (in `apps/web`):**
- `@/components` → `apps/web/components`
- `@/hooks` → `apps/web/hooks`
- `@/lib` → `apps/web/lib`

### Go API structure

```
apps/api/
  cmd/server/main.go          # Entry point: config, DB migrate, wire services, start servers
  internal/
    config/                   # Viper config (env prefix: JUSTSERVICE_)
    auth/                     # JWT issuance, OIDC handlers, password hashing
    executor/                 # Task execution logic (sync + async modes)
    rbac/                     # Permission enforcement middleware
    admin/                    # Admin endpoints (users, plugins, roles, OIDC settings)
    plugin/                   # Plugin registry, gRPC client to plugins
    server/                   # HTTP router (chi) + gRPC server wiring
  migrations/                 # SQL migrations via golang-migrate (run on startup)
  proto/                      # Protobuf definitions for plugin gRPC protocol
```

Key dependencies: `chi/v5`, `sqlx`, `lib/pq`, `zerolog`, `viper`, `jwt/v5`, `go-oidc/v3`, `grpc`, `golang-migrate`.

### Plugin system

Plugins are standalone Go binaries that implement the `plugins/sdk` `Handler` interface. On startup each plugin connects to the API via gRPC and registers its task definitions (name, input JSON schema, sync/async flag, category). The API then routes execution requests back to the plugin.

- **Sync tasks**: API waits for `ExecuteSync` RPC response and returns result to caller.
- **Async tasks**: API calls `ExecuteAsync` RPC, plugin streams progress events, UI polls execution status.
- Task input schemas are JSONB in PostgreSQL and drive the form generation in the frontend.

See `plugins/hello-world/` and `plugins/webhook/` for reference implementations.

### Environment variables

The Go API uses viper with `JUSTSERVICE_` prefix. Required at runtime:

| Variable | Description |
|---|---|
| `JUSTSERVICE_DATABASE_DSN` | PostgreSQL connection string |
| `JUSTSERVICE_JWT_SECRET` | JWT signing secret (≥32 chars in production) |
| `NEXT_PUBLIC_API_URL` | API base URL baked into Next.js at build time |

Optional: `JUSTSERVICE_LOG_LEVEL` (info/debug/warn/error), `JUSTSERVICE_LOG_FORMAT` (json/pretty), `JUSTSERVICE_SERVER_PORT` (default 8080).

OIDC provider configuration is stored in the database and managed via the admin UI — no env vars needed.

### Database

PostgreSQL 17. Migrations run automatically on API startup via golang-migrate. Key tables: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `plugins`, `task_definitions`, `executions`, `audit_log`, `settings`, `oidc_providers`. All PKs are UUIDs. Task inputs/outputs stored as JSONB.

<!-- HEROUI-REACT-AGENTS-MD-START -->
[HeroUI React v3 Docs Index]|root: ./.heroui-docs/react|STOP. What you remember about HeroUI React v3 is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: heroui agents-md --react --output AGENTS.md|components/(buttons):{button-group.mdx,button.mdx,close-button.mdx,toggle-button-group.mdx,toggle-button.mdx}|components/(collections):{dropdown.mdx,list-box.mdx,tag-group.mdx}|components/(colors):{color-area.mdx,color-field.mdx,color-picker.mdx,color-slider.mdx,color-swatch-picker.mdx,color-swatch.mdx}|components/(controls):{slider.mdx,switch.mdx}|components/(data-display):{badge.mdx,chip.mdx,table.mdx}|components/(date-and-time):{calendar.mdx,date-field.mdx,date-picker.mdx,date-range-picker.mdx,range-calendar.mdx,time-field.mdx}|components/(feedback):{alert.mdx,meter.mdx,progress-bar.mdx,progress-circle.mdx,skeleton.mdx,spinner.mdx}|components/(forms):{checkbox-group.mdx,checkbox.mdx,description.mdx,error-message.mdx,field-error.mdx,fieldset.mdx,form.mdx,input-group.mdx,input-otp.mdx,input.mdx,label.mdx,number-field.mdx,radio-group.mdx,search-field.mdx,text-area.mdx,text-field.mdx}|components/(layout):{card.mdx,separator.mdx,surface.mdx,toolbar.mdx}|components/(media):{avatar.mdx}|components/(navigation):{accordion.mdx,breadcrumbs.mdx,disclosure-group.mdx,disclosure.mdx,link.mdx,pagination.mdx,tabs.mdx}|components/(overlays):{alert-dialog.mdx,drawer.mdx,modal.mdx,popover.mdx,toast.mdx,tooltip.mdx}|components/(pickers):{autocomplete.mdx,combo-box.mdx,select.mdx}|components/(typography):{kbd.mdx}|components/(utilities):{scroll-shadow.mdx}|getting-started/(handbook):{animation.mdx,colors.mdx,composition.mdx,styling.mdx,theming.mdx}|getting-started/(overview):{design-principles.mdx,quick-start.mdx}|getting-started/(ui-for-agents):{agent-skills.mdx,agents-md.mdx,llms-txt.mdx,mcp-server.mdx}|releases:{v3-0-0-alpha-32.mdx,v3-0-0-alpha-33.mdx,v3-0-0-alpha-34.mdx,v3-0-0-alpha-35.mdx,v3-0-0-beta-1.mdx,v3-0-0-beta-2.mdx,v3-0-0-beta-3.mdx,v3-0-0-beta-4.mdx,v3-0-0-beta-6.mdx,v3-0-0-beta-7.mdx,v3-0-0-beta-8.mdx,v3-0-0-rc-1.mdx,v3-0-0.mdx}|demos/accordion:{basic.tsx,custom-indicator.tsx,custom-render-function.tsx,custom-styles.tsx,disabled.tsx,faq.tsx,multiple.tsx,surface.tsx,without-separator.tsx}|demos/alert-dialog:{backdrop-variants.tsx,close-methods.tsx,controlled.tsx,custom-animations.tsx,custom-backdrop.tsx,custom-icon.tsx,custom-portal.tsx,custom-trigger.tsx,default.tsx,dismiss-behavior.tsx,placements.tsx,sizes.tsx,statuses.tsx,with-close-button.tsx}|demos/alert:{basic.tsx}|demos/autocomplete:{allows-empty-collection.tsx,asynchronous-filtering.tsx,controlled-open-state.tsx,controlled.tsx,custom-indicator.tsx,default.tsx,disabled.tsx,email-recipients.tsx,full-width.tsx,location-search.tsx,multiple-select.tsx,required.tsx,single-select.tsx,tag-group-selection.tsx,user-selection-multiple.tsx,user-selection.tsx,variants.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/avatar:{basic.tsx,colors.tsx,custom-styles.tsx,fallback.tsx,group.tsx,sizes.tsx,variants.tsx}|demos/badge:{basic.tsx,colors.tsx,dot.tsx,placements.tsx,sizes.tsx,variants.tsx,with-content.tsx}|demos/breadcrumbs:{basic.tsx,custom-render-function.tsx,custom-separator.tsx,disabled.tsx,level-2.tsx,level-3.tsx}|demos/button-group:{basic.tsx,disabled.tsx,full-width.tsx,orientation.tsx,sizes.tsx,variants.tsx,with-icons.tsx,without-separator.tsx}|demos/button:{basic.tsx,custom-render-function.tsx,custom-variants.tsx,disabled.tsx,full-width.tsx,icon-only.tsx,loading-state.tsx,loading.tsx,outline-variant.tsx,ripple-effect.tsx,sizes.tsx,social.tsx,variants.tsx,with-icons.tsx}|demos/calendar:{basic.tsx,booking-calendar.tsx,controlled.tsx,custom-icons.tsx,custom-styles.tsx,default-value.tsx,disabled.tsx,focused-value.tsx,international-calendar.tsx,min-max-dates.tsx,multiple-months.tsx,read-only.tsx,unavailable-dates.tsx,with-indicators.tsx,year-picker.tsx}|demos/card:{default.tsx,horizontal.tsx,variants.tsx,with-avatar.tsx,with-form.tsx,with-images.tsx}|demos/checkbox-group:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,features-and-addons.tsx,indeterminate.tsx,on-surface.tsx,validation.tsx,with-custom-indicator.tsx}|demos/checkbox:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-render-function.tsx,custom-styles.tsx,default-selected.tsx,disabled.tsx,form.tsx,full-rounded.tsx,indeterminate.tsx,invalid.tsx,render-props.tsx,variants.tsx,with-description.tsx,with-label.tsx}|demos/chip:{basic.tsx,statuses.tsx,variants.tsx,with-icon.tsx}|demos/close-button:{default.tsx,interactive.tsx,variants.tsx,with-custom-icon.tsx}|demos/color-area:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,space-and-channels.tsx,with-dots.tsx}|demos/color-field:{basic.tsx,channel-editing.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,required.tsx,variants.tsx,with-description.tsx}|demos/color-picker:{basic.tsx,controlled.tsx,with-fields.tsx,with-sliders.tsx,with-swatches.tsx}|demos/color-slider:{alpha-channel.tsx,basic.tsx,channels.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,rgb-channels.tsx,vertical.tsx}|demos/color-swatch-picker:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-render-function.tsx,default-value.tsx,disabled.tsx,sizes.tsx,stack-layout.tsx,variants.tsx}|demos/color-swatch:{accessibility.tsx,basic.tsx,custom-render-function.tsx,custom-styles.tsx,shapes.tsx,sizes.tsx,transparency.tsx}|demos/combo-box:{allows-custom-value.tsx,asynchronous-loading.tsx,controlled-input-value.tsx,controlled.tsx,custom-filtering.tsx,custom-indicator.tsx,custom-render-function.tsx,custom-value.tsx,default-selected-key.tsx,default.tsx,disabled.tsx,full-width.tsx,menu-trigger.tsx,on-surface.tsx,required.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/date-field:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,granularity.tsx,invalid.tsx,on-surface.tsx,required.tsx,variants.tsx,with-description.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-validation.tsx}|demos/date-picker:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,format-options-no-ssr.tsx,format-options.tsx,international-calendar.tsx,with-custom-indicator.tsx,with-validation.tsx}|demos/date-range-picker:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,format-options-no-ssr.tsx,format-options.tsx,input-container.tsx,international-calendar.tsx,with-custom-indicator.tsx,with-validation.tsx}|demos/description:{basic.tsx}|demos/disclosure-group:{basic.tsx,controlled.tsx}|demos/disclosure:{basic.tsx,custom-render-function.tsx}|demos/drawer:{backdrop-variants.tsx,basic.tsx,controlled.tsx,navigation.tsx,non-dismissable.tsx,placements.tsx,scrollable-content.tsx,with-form.tsx}|demos/dropdown:{controlled-open-state.tsx,controlled.tsx,custom-trigger.tsx,default.tsx,long-press-trigger.tsx,single-with-custom-indicator.tsx,with-custom-submenu-indicator.tsx,with-descriptions.tsx,with-disabled-items.tsx,with-icons.tsx,with-keyboard-shortcuts.tsx,with-multiple-selection.tsx,with-section-level-selection.tsx,with-sections.tsx,with-single-selection.tsx,with-submenus.tsx}|demos/error-message:{basic.tsx,with-tag-group.tsx}|demos/field-error:{basic.tsx}|demos/fieldset:{basic.tsx,on-surface.tsx}|demos/form:{basic.tsx,custom-render-function.tsx}|demos/input-group:{default.tsx,disabled.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,password-with-toggle.tsx,required.tsx,variants.tsx,with-badge-suffix.tsx,with-copy-suffix.tsx,with-icon-prefix-and-copy-suffix.tsx,with-icon-prefix-and-text-suffix.tsx,with-keyboard-shortcut.tsx,with-loading-suffix.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-text-prefix.tsx,with-text-suffix.tsx,with-textarea.tsx}|demos/input-otp:{basic.tsx,controlled.tsx,disabled.tsx,form-example.tsx,four-digits.tsx,on-complete.tsx,on-surface.tsx,variants.tsx,with-pattern.tsx,with-validation.tsx}|demos/input:{basic.tsx,controlled.tsx,full-width.tsx,on-surface.tsx,types.tsx,variants.tsx}|demos/kbd:{basic.tsx,inline.tsx,instructional.tsx,navigation.tsx,special.tsx,variants.tsx}|demos/label:{basic.tsx}|demos/link:{basic.tsx,custom-icon.tsx,custom-render-function.tsx,icon-placement.tsx,underline-and-offset.tsx,underline-offset.tsx,underline-variants.tsx}|demos/list-box:{controlled.tsx,custom-check-icon.tsx,custom-render-function.tsx,default.tsx,multi-select.tsx,virtualization.tsx,with-disabled-items.tsx,with-sections.tsx}|demos/meter:{basic.tsx,colors.tsx,custom-value.tsx,sizes.tsx,without-label.tsx}|demos/modal:{backdrop-variants.tsx,close-methods.tsx,controlled.tsx,custom-animations.tsx,custom-backdrop.tsx,custom-portal.tsx,custom-trigger.tsx,default.tsx,dismiss-behavior.tsx,placements.tsx,scroll-comparison.tsx,sizes.tsx,with-form.tsx}|demos/number-field:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,on-surface.tsx,required.tsx,validation.tsx,variants.tsx,with-chevrons.tsx,with-description.tsx,with-format-options.tsx,with-step.tsx,with-validation.tsx}|demos/pagination:{basic.tsx,controlled.tsx,custom-icons.tsx,disabled.tsx,simple-prev-next.tsx,sizes.tsx,with-ellipsis.tsx,with-summary.tsx}|demos/popover:{basic.tsx,custom-render-function.tsx,interactive.tsx,placement.tsx,with-arrow.tsx}|demos/progress-bar:{basic.tsx,colors.tsx,custom-value.tsx,indeterminate.tsx,sizes.tsx,without-label.tsx}|demos/progress-circle:{basic.tsx,colors.tsx,custom-svg.tsx,indeterminate.tsx,sizes.tsx,with-label.tsx}|demos/radio-group:{basic.tsx,controlled.tsx,custom-indicator.tsx,custom-render-function.tsx,delivery-and-payment.tsx,disabled.tsx,horizontal.tsx,on-surface.tsx,uncontrolled.tsx,validation.tsx,variants.tsx}|demos/range-calendar:{allows-non-contiguous-ranges.tsx,basic.tsx,booking-calendar.tsx,controlled.tsx,default-value.tsx,disabled.tsx,focused-value.tsx,international-calendar.tsx,invalid.tsx,min-max-dates.tsx,multiple-months.tsx,read-only.tsx,three-months.tsx,unavailable-dates.tsx,with-indicators.tsx,year-picker.tsx}|demos/scroll-shadow:{custom-size.tsx,default.tsx,hide-scroll-bar.tsx,orientation.tsx,visibility-change.tsx,with-card.tsx}|demos/search-field:{basic.tsx,controlled.tsx,custom-icons.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,on-surface.tsx,required.tsx,validation.tsx,variants.tsx,with-description.tsx,with-keyboard-shortcut.tsx,with-validation.tsx}|demos/select:{asynchronous-loading.tsx,controlled-multiple.tsx,controlled-open-state.tsx,controlled.tsx,custom-indicator.tsx,custom-render-function.tsx,custom-value-multiple.tsx,custom-value.tsx,default.tsx,disabled.tsx,full-width.tsx,multiple-select.tsx,on-surface.tsx,required.tsx,variants.tsx,with-description.tsx,with-disabled-options.tsx,with-sections.tsx}|demos/separator:{basic.tsx,custom-render-function.tsx,manual-variant-override.tsx,variants.tsx,vertical.tsx,with-content.tsx,with-surface.tsx}|demos/skeleton:{animation-types.tsx,basic.tsx,card.tsx,grid.tsx,list.tsx,single-shimmer.tsx,text-content.tsx,user-profile.tsx}|demos/slider:{custom-render-function.tsx,default.tsx,disabled.tsx,range.tsx,vertical.tsx}|demos/spinner:{basic.tsx,colors.tsx,sizes.tsx}|demos/surface:{variants.tsx}|demos/switch:{basic.tsx,controlled.tsx,custom-render-function.tsx,custom-styles.tsx,default-selected.tsx,disabled.tsx,form.tsx,group-horizontal.tsx,group.tsx,label-position.tsx,render-props.tsx,sizes.tsx,with-description.tsx,with-icons.tsx,without-label.tsx}|demos/table:{async-loading.tsx,basic.tsx,column-resizing.tsx,custom-cells.tsx,empty-state.tsx,pagination.tsx,secondary-variant.tsx,selection.tsx,sorting.tsx,tanstack-table.tsx,virtualization.tsx}|demos/tabs:{basic.tsx,custom-render-function.tsx,custom-styles.tsx,disabled.tsx,secondary-vertical.tsx,secondary.tsx,vertical.tsx,with-separator.tsx}|demos/tag-group:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,selection-modes.tsx,sizes.tsx,variants.tsx,with-error-message.tsx,with-list-data.tsx,with-prefix.tsx,with-remove-button.tsx}|demos/textarea:{basic.tsx,controlled.tsx,full-width.tsx,on-surface.tsx,rows.tsx,variants.tsx}|demos/textfield:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,full-width.tsx,input-types.tsx,on-surface.tsx,required.tsx,textarea.tsx,validation.tsx,with-description.tsx,with-error.tsx}|demos/time-field:{basic.tsx,controlled.tsx,custom-render-function.tsx,disabled.tsx,form-example.tsx,full-width.tsx,invalid.tsx,on-surface.tsx,required.tsx,with-description.tsx,with-prefix-and-suffix.tsx,with-prefix-icon.tsx,with-suffix-icon.tsx,with-validation.tsx}|demos/toast:{callbacks.tsx,custom-indicator.tsx,custom-queue.tsx,custom-toast.tsx,default.tsx,placements.tsx,promise.tsx,simple.tsx,variants.tsx}|demos/toggle-button-group:{attached.tsx,basic.tsx,controlled.tsx,disabled.tsx,full-width.tsx,orientation.tsx,selection-mode.tsx,sizes.tsx,without-separator.tsx}|demos/toggle-button:{basic.tsx,controlled.tsx,disabled.tsx,icon-only.tsx,sizes.tsx,variants.tsx}|demos/toolbar:{basic.tsx,custom-styles.tsx,vertical.tsx,with-button-group.tsx}|demos/tooltip:{basic.tsx,custom-render-function.tsx,custom-trigger.tsx,placement.tsx,with-arrow.tsx}
<!-- HEROUI-REACT-AGENTS-MD-END -->
