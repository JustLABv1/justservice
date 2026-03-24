"use client"

import { useParams, useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@heroui/react"
import { ExecutionDetail } from "@/components/execution-detail"
import { PageHeader } from "@/components/page-header"

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        breadcrumbs={[
          { label: "Executions", href: "/executions" },
          { label: id },
        ]}
        actions={
          <Button variant="ghost" size="sm" onPress={() => router.push("/executions")}>
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-7xl">
          <ExecutionDetail executionId={id} />
        </div>
      </div>
    </div>
  )
}
