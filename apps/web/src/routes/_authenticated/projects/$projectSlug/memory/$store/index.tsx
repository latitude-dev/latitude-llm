import { Text } from "@repo/ui"
import { createFileRoute, useParams } from "@tanstack/react-router"
import { DatabaseIcon } from "lucide-react"
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
  component: StoreDetailPage,
})

function StoreDetailPage() {
  const project = useRouteProject()
  const { projectSlug, store } = Route.useParams()
  const storeId = decodeStoreSegment(store)
  const [recordParam, setRecordParam] = useParamState("record", "")
  const selectedRecordId = recordParam === "" ? undefined : decodeRecordParam(recordParam)

  const { data: snapshot, isLoading } = useMemoryStoreSnapshot({ projectId: project.id, storeId })

  return (
    <Layout>
      <Layout.Header
        title={
          <div className="flex min-w-0 items-center gap-2">
            <DatabaseIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Text.H4 className={storeId === "" ? "italic text-muted-foreground" : "font-mono"} noWrap ellipsis>
              {storeDisplayLabel(storeId)}
            </Text.H4>
          </div>
        }
      />
      <Layout.Body>
        <Layout.Sidebar>
          <RecordTreeSidebar
            records={snapshot?.records ?? []}
            isLoading={isLoading}
            selectedRecordId={selectedRecordId}
            onSelect={(recordId) => setRecordParam(encodeRecordParam(recordId))}
          />
        </Layout.Sidebar>
        <Layout.List>
          <StoreUsersList projectId={project.id} projectSlug={projectSlug} storeId={storeId} />
          {selectedRecordId !== undefined ? (
            <RecordContentView projectId={project.id} storeId={storeId} recordId={selectedRecordId} />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <Text.H5 color="foregroundMuted">Select a record to view its contents.</Text.H5>
            </div>
          )}
        </Layout.List>
      </Layout.Body>
    </Layout>
  )
}
