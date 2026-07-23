import { Button, Text, Tooltip } from "@repo/ui"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import { ArrowLeftIcon, DatabaseIcon } from "lucide-react"
import { useMemoryStoreSnapshot } from "../../../../../../domains/memories/memories.collection.ts"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { BreadcrumbText } from "../../../../-components/breadcrumb-ui.tsx"
import { useRouteProject } from "../../-route-data.ts"
import {
  decodeRecordParam,
  decodeStoreSegment,
  encodeRecordParam,
  storeDisplayLabel,
} from "../-components/store-encoding.ts"
import { RecordContentView } from "./-components/record-content-view.tsx"
import { RecordTreeSidebar } from "./-components/record-tree-sidebar.tsx"
import { StoreHomeView } from "./-components/store-home-view.tsx"
import { StoreUsersList } from "./-components/store-users-list.tsx"

function StoreBreadcrumb() {
  const { store } = useParams({ strict: false })
  return (
    <BreadcrumbText variant="current">{store ? storeDisplayLabel(decodeStoreSegment(store)) : "Store"}</BreadcrumbText>
  )
}

export const Route = createFileRoute("/_authenticated/projects/$projectSlug/memory/$store/")({
  staticData: {
    breadcrumb: StoreBreadcrumb,
  },
  // `record` / `change` are read synchronously via useParamState; declaring them
  // here lets cross-page links deep-link a record (and a specific change).
  validateSearch: (search: Record<string, unknown>): { record?: string; change?: string } => ({
    ...(typeof search.record === "string" ? { record: search.record } : {}),
    ...(typeof search.change === "string" ? { change: search.change } : {}),
  }),
  component: StoreDetailPage,
})

function StoreDetailPage() {
  const project = useRouteProject()
  const { projectSlug, store } = Route.useParams()
  const storeId = decodeStoreSegment(store)
  const [recordParam, setRecordParam] = useParamState("record", "")
  const [changeParam, setChangeParam] = useParamState("change", "")
  const selectedRecordId = recordParam === "" ? undefined : decodeRecordParam(recordParam)

  const { data: snapshot, isLoading } = useMemoryStoreSnapshot({ projectId: project.id, storeId })

  return (
    <Layout className="gap-0">
      <Layout.Header
        className="border-b px-6 py-4"
        title={
          <div className="flex min-w-0 items-center gap-3">
            <Tooltip
              asChild
              side="bottom"
              trigger={
                <Button asChild variant="ghost" className="h-8 w-8 shrink-0 p-0" aria-label="Back to memory stores">
                  <Link to="/projects/$projectSlug/memory" params={{ projectSlug }}>
                    <ArrowLeftIcon className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </Button>
              }
            >
              Back to stores
            </Tooltip>
            <DatabaseIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Text.H4 className={storeId === "" ? "italic text-muted-foreground" : "font-mono"} noWrap ellipsis>
              {storeDisplayLabel(storeId)}
            </Text.H4>
          </div>
        }
        description={<StoreUsersList projectId={project.id} projectSlug={projectSlug} storeId={storeId} />}
      />
      <Layout.Body>
        <Layout.Sidebar>
          <RecordTreeSidebar
            records={snapshot?.records ?? []}
            isLoading={isLoading}
            selectedRecordId={selectedRecordId}
            onSelect={(recordId) => {
              setRecordParam(encodeRecordParam(recordId))
              setChangeParam("")
            }}
            onSelectHome={() => {
              setRecordParam("")
              setChangeParam("")
            }}
            homeActive={selectedRecordId === undefined}
          />
        </Layout.Sidebar>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selectedRecordId !== undefined ? (
            <RecordContentView
              projectId={project.id}
              projectSlug={projectSlug}
              storeId={storeId}
              recordId={selectedRecordId}
              changeSpanId={changeParam === "" ? undefined : changeParam}
              onSelectChange={(spanId) => setChangeParam(spanId ?? "")}
            />
          ) : (
            <StoreHomeView storeId={storeId} />
          )}
        </div>
      </Layout.Body>
    </Layout>
  )
}
