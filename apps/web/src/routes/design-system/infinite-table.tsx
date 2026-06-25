import { InfiniteTable, type InfiniteTableColumn, Text } from "@repo/ui"
import { createFileRoute } from "@tanstack/react-router"
import { DemoFrame } from "./-components/demo-frame.tsx"
import { DesignSystemPage } from "./-components/design-system-page.tsx"
import { TypographySection } from "./-components/typography-table.tsx"
import { UsageCode, UsageSection } from "./-components/usage-section.tsx"

export const Route = createFileRoute("/design-system/infinite-table")({
  component: InfiniteTablePage,
})

type DemoRow = { id: string; name: string; amount: number }

const demoTableColumns: InfiniteTableColumn<DemoRow>[] = [
  {
    key: "name",
    header: "Name",
    render: (r) => r.name,
    renderSubheader: () => (
      <Text.H7 color="foregroundMuted" display="block">
        —
      </Text.H7>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    align: "end",
    sortKey: "amount",
    render: (r) => r.amount,
    renderSubheader: () => (
      <Text.H7 color="foregroundMuted" display="block">
        subtotal
      </Text.H7>
    ),
  },
]

type GroupedDemoRow = DemoRow & { tier: "gold" | "silver" }

const groupedDemoColumns: InfiniteTableColumn<GroupedDemoRow>[] = [
  { key: "name", header: "Name", render: (r) => r.name },
  { key: "amount", header: "Amount", align: "end", render: (r) => r.amount },
]

const subheaderData: DemoRow[] = [
  { id: "a", name: "Northwind", amount: 120 },
  { id: "b", name: "Contoso", amount: 84 },
  { id: "c", name: "Fabrikam", amount: 210 },
]

const groupedData: GroupedDemoRow[] = [
  { id: "a", name: "Northwind", amount: 210, tier: "gold" },
  { id: "b", name: "Fabrikam", amount: 120, tier: "gold" },
  { id: "c", name: "Contoso", amount: 84, tier: "silver" },
  { id: "d", name: "Adventure Works", amount: 42, tier: "silver" },
]

function InfiniteTablePage() {
  return (
    <DesignSystemPage
      eyebrow="Components"
      title="Infinite table"
      description="Virtualized list with sortable headers, optional subheader row, and grouped rows."
      wide
    >
      <UsageSection description="InfiniteTable virtualizes rows for large datasets. Define columns with render functions and a stable getRowKey.">
        <UsageCode
          lines={[
            'import { InfiniteTable } from "@repo/ui"',
            "",
            "<InfiniteTable",
            "  data={rows}",
            "  columns={columns}",
            "  getRowKey={(row) => row.id}",
            "  sorting={sorting}",
            "  onSortChange={setSorting}",
            "/>",
          ]}
        />
      </UsageSection>

      <TypographySection
        title="With subheader row"
        description="renderSubheader adds a second line under sortable column headers — useful for aggregates."
      >
        <DemoFrame className="block w-full">
          <InfiniteTable<DemoRow>
            scrollAreaLayout="intrinsic"
            data={subheaderData}
            columns={demoTableColumns}
            getRowKey={(r) => r.id}
            sorting={{ column: "amount", direction: "desc" }}
            defaultSorting={{ column: "amount", direction: "desc" }}
            onSortChange={() => {}}
          />
        </DemoFrame>
      </TypographySection>

      <TypographySection
        title="Grouped rows"
        description="getRowGroup injects full-width header rows when consecutive rows change group. Data must arrive ordered by group."
      >
        <DemoFrame className="block w-full">
          <InfiniteTable<GroupedDemoRow>
            scrollAreaLayout="intrinsic"
            data={groupedData}
            columns={groupedDemoColumns}
            getRowKey={(r) => r.id}
            getRowGroup={(r) => r.tier}
            renderGroupHeader={(groupKey) => (
              <div className="mx-1 flex items-center gap-2 rounded-md bg-secondary px-3 py-2">
                <Text.H6 weight="semibold" className="capitalize">
                  {groupKey}
                </Text.H6>
                <Text.H6 color="foregroundMuted">2</Text.H6>
              </div>
            )}
          />
        </DemoFrame>
      </TypographySection>
    </DesignSystemPage>
  )
}
