export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4 py-8">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xl shadow-sm select-none">
          JS
        </div>
        <span className="text-xl font-semibold tracking-tight">JustService</span>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">Self-service task execution portal</span>
      </div>
      {children}
    </div>
  )
}
