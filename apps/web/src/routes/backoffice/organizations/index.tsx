import {
  Avatar,
  Badge,
  InfiniteTable,
  type InfiniteTableColumn,
  type InfiniteTableInfiniteScroll,
  Text,
} from "@repo/ui"
import { formatCount, relativeTime } from "@repo/utils"
import { useInfiniteQuery } from "@tanstack/react-query"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useCallback, useMemo } from "react"
import {
  type AdminOrganizationUsageItemDto,
  adminListOrganizationsByUsage,
} from "../../../domains/admin/organizations.functions.ts"

const PAGE_SIZE = 50

export const Route = createFileRoute("/backoffice/organizations/")({
  component: BackofficeOrganizationsByUsagePage,
})

function BackofficeOrganizationsByUsagePage() {
  const navigate = useNavigate()

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["backoffice", "organizations-by-usage"],
    queryFn: ({ pageParam }) =>
      adminListOrganizationsByUsage({
        data: {
          limit: PAGE_SIZE,
          ...(pageParam ? { cursor: pageParam } : {}),
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  })

  const items = useMemo<readonly AdminOrganizationUsageItemDto[]>(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  )

  const infiniteScroll: InfiniteTableInfiniteScroll = useMemo(
    () => ({
      hasMore: hasNextPage,
      isLoadingMore: isFetchingNextPage,
      onLoadMore: () => {
        void fetchNextPage()
      },
    }),
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  )

  const columns = useMemo<InfiniteTableColumn<AdminOrganizationUsageItemDto>[]>(
    () => [
      {
        key: "name",
        header: "Organization",
        minWidth: 200,
        width: 320,
        render: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={row.name} size="sm" />
            <div className="flex min-w-0 flex-col leading-tight">
              <Text.H5 weight="medium" ellipsis noWrap>
                {row.name}
              </Text.H5>
              <Text.H6 color="foregroundMuted" ellipsis noWrap>
                /{row.slug}
              </Text.H6>
            </div>
          </div>
        ),
      },
      {
        key: "plan",
        header: "Plan",
        minWidth: 90,
        width: 120,
        render: (row) =>
          row.plan ? <Badge variant="outlineMuted">{row.plan}</Badge> : <Text.H6 color="foregroundMuted">—</Text.H6>,
      },
      {
        key: "members",
        header: "Members",
        align: "end",
        minWidth: 80,
        width: 100,
        render: (row) => (
          <Text.H6 noWrap>
            <span className="tabular-nums">{formatCount(row.memberCount)}</span>
          </Text.H6>
        ),
      },
      {
        key: "traces",
        header: "Traces (30d)",
        align: "end",
        minWidth: 100,
        width: 130,
        render: (row) => (
          <Text.H5 weight="medium" noWrap>
            <span className="tabular-nums">{formatCount(row.traceCount)}</span>
          </Text.H5>
        ),
      },
      {
        key: "lastTraceAt",
        header: "Last trace",
        align: "end",
        minWidth: 110,
        width: 150,
        render: (row) =>
          row.lastTraceAt ? (
            <Text.H6 color="foregroundMuted" noWrap>
              {relativeTime(row.lastTraceAt)}
            </Text.H6>
          ) : (
            <Text.H6 color="foregroundMuted">—</Text.H6>
          ),
      },
    ],
    [],
  )

  const handleRowClick = useCallback(
    (row: AdminOrganizationUsageItemDto) => {
      void navigate({
        to: "/backoffice/organizations/$organizationId",
        params: { organizationId: row.id },
      })
    },
    [navigate],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-6 py-4">
        <Text.H4 weight="semibold">Organizations by usage</Text.H4>
        <Text.H6 color="foregroundMuted">
          Sorted by trace count over the last 30 days. Click a row to open the org detail page.
        </Text.H6>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-6 pt-4 pb-6">
        <InfiniteTable
          data={items}
          isLoading={isLoading}
          columns={columns}
          getRowKey={(row) => row.id}
          onRowClick={handleRowClick}
          getRowAriaLabel={(row) => `Open ${row.name}`}
          rowInteractionRole="link"
          infiniteScroll={infiniteScroll}
          blankSlate="No organizations have produced traces in the last 30 days."
        />
      </div>
    </div>
  )
}
