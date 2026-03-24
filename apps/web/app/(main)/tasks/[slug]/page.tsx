"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button, Skeleton } from "@heroui/react"
import { PageHeader } from "@/components/page-header"
import { TaskRunner } from "@/components/task-runner"
import { tasks as tasksApi, type TaskDefinition } from "@/lib/api"

export default function TaskPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string

  const [task, setTask] = useState<TaskDefinition | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    tasksApi
      .get(slug)
      .then(setTask)
      .catch(() => router.push("/tasks"))
      .finally(() => setIsLoading(false))
  }, [slug, router])

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <PageHeader breadcrumbs={[{ label: "Tasks", href: "/tasks" }, { label: "Loading…" }]} />
        <div className="flex-1 overflow-auto p-6 max-w-2xl">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!task) return null

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        breadcrumbs={[
          { label: "Tasks", href: "/tasks" },
          { label: task.name },
        ]}
        actions={
          <Button variant="ghost" size="sm" onPress={() => router.back()}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl">
          <TaskRunner task={task} />
        </div>
      </div>
    </div>
  )
}
