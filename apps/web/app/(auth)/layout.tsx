export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.08),transparent_22%)] dark:bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.12),transparent_18%)]" />
      <div className="relative grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1.1fr)_28rem] lg:items-center">
        <section className="section-shell hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:gap-8 lg:p-8">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground text-xl font-bold shadow-sm select-none">
                JS
              </div>
              <div>
                <p className="text-xl font-semibold tracking-tight text-foreground">JustService</p>
                <p className="text-sm text-muted">Self-service task execution portal</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Operational workspace</p>
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-foreground">
                Run internal workflows without jumping between tools.
              </h1>
              <p className="max-w-xl text-sm leading-7 text-muted">
                Launch tasks, inspect execution results, and monitor plugin health from a single, compact control surface.
              </p>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-3">
            <div className="rounded-[1.5rem] border border-default-200/70 bg-content1/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Task launch</p>
              <p className="mt-2 text-lg font-semibold text-foreground">Schema-driven forms</p>
              <p className="mt-1 text-sm text-muted">Run sync or async jobs with the same flow.</p>
            </div>
            <div className="rounded-[1.5rem] border border-default-200/70 bg-content1/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Execution review</p>
              <p className="mt-2 text-lg font-semibold text-foreground">Live status visibility</p>
              <p className="mt-1 text-sm text-muted">Track recent runs and inspect payloads quickly.</p>
            </div>
            <div className="rounded-[1.5rem] border border-default-200/70 bg-content1/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Admin controls</p>
              <p className="mt-2 text-lg font-semibold text-foreground">Plugin and access management</p>
              <p className="mt-1 text-sm text-muted">Keep services healthy and operators informed.</p>
            </div>
          </div>
        </section>

        <div className="mx-auto flex w-full max-w-md flex-col gap-4">
          <div className="flex items-center justify-center gap-3 text-center lg:hidden">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground text-lg font-bold shadow-sm select-none">
              JS
            </div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-foreground">JustService</p>
              <p className="text-sm text-muted">Self-service task execution portal</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
