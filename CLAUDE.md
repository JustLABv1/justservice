# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev          # Start all apps (Next.js with Turbopack)
pnpm build        # Build all packages/apps
pnpm lint         # Lint all packages/apps
pnpm typecheck    # Type-check all packages/apps
pnpm format       # Format all packages/apps

# Add a shadcn component (run from repo root)
pnpm dlx shadcn@latest add <component> -c apps/web
```

## Architecture

This is a pnpm + Turborepo monorepo with two layers:

**`apps/web`** — Next.js 16 app (App Router, React 19, Turbopack). Uses `@workspace/ui` for all shared UI. App-local code lives in `components/`, `hooks/`, and `lib/`. The `components/theme-provider.tsx` wraps the app with `next-themes` and wires a `d` hotkey for dark/light toggle.

**`packages/ui`** — Shared component library. All shadcn components land here (in `src/components/`). Tailwind CSS v4 is configured here — `src/styles/globals.css` is the single stylesheet imported by the app as `@workspace/ui/globals.css`. The package exports components, hooks, lib utilities, and CSS via explicit `exports` in `package.json`.

**CSS/Tailwind:** Tailwind v4 scans both `apps/**` and `packages/ui/**` from the single `globals.css` in the UI package. There is no `tailwind.config.*` file — configuration is CSS-first.

**shadcn style:** `radix-nova` with `neutral` base color, CSS variables enabled, Lucide icons. Utility alias `utils` resolves to `@workspace/ui/lib/utils`.

**Path aliases (in `apps/web`):**
- `@/components` → `apps/web/components`
- `@/hooks` → `apps/web/hooks`
- `@/lib` → `apps/web/lib`
- `@workspace/ui/components/*` → shared shadcn components
