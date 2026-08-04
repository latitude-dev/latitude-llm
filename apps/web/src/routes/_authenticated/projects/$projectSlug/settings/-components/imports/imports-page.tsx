import { Button, Icon } from "@repo/ui"
import { useQuery } from "@tanstack/react-query"
import { ImportIcon, Plus } from "lucide-react"
import { useState } from "react"
import { BlankSlate } from "../../../../../../../components/blank-slate.tsx"
import {
  type ImportRecord,
  importsQueryKey,
  listImports,
} from "../../../../../../../domains/imports/imports.functions.ts"
import { ImportJobsTable } from "./import-jobs-table.tsx"
import { ImportWizardModal } from "./import-wizard-modal.tsx"

export function ImportsPage({
  projectId,
  projectSlug: _projectSlug,
}: {
  readonly projectId: string
  readonly projectSlug: string
}) {
  const [creating, setCreating] = useState(false)
  const [retryJob, setRetryJob] = useState<ImportRecord | null>(null)

  const { data: imports = [], isLoading } = useQuery({
    queryKey: importsQueryKey(projectId),
    queryFn: () => listImports({ data: { projectId } }),
    refetchInterval: (query) => {
      const rows = query.state.data ?? []
      return rows.some((j) => j.status === "created" || j.status === "queued" || j.status === "running") ? 3000 : false
    },
  })

  return (
    <div className="flex flex-1 flex-col gap-4">
      {isLoading ? null : imports.length === 0 ? (
        <BlankSlate
          icon={ImportIcon}
          title="No imports yet"
          description="Import your existing sessions, traces and spans from other observability platforms into this project."
          action={{
            label: "Import traces",
            icon: Plus,
            onClick: () => setCreating(true),
          }}
          docsHref="https://docs.latitude.so/telemetry/imports/overview"
        />
      ) : (
        <>
          <div className="flex flex-row justify-end">
            <Button onClick={() => setCreating(true)}>
              <Icon icon={Plus} size="sm" />
              Import traces
            </Button>
          </div>
          <ImportJobsTable
            jobs={imports}
            projectId={projectId}
            onRetry={(retried) => {
              setRetryJob(retried)
              setCreating(true)
            }}
          />
        </>
      )}

      {creating ? (
        <ImportWizardModal
          projectId={projectId}
          {...(retryJob ? { retryJob } : {})}
          onClose={() => {
            setCreating(false)
            setRetryJob(null)
          }}
        />
      ) : null}
    </div>
  )
}
