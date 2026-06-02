import { Badge, Text } from "@repo/ui"
import { relativeTime } from "@repo/utils"
import type {
  AdminProjectTaxonomyDto,
  AdminTaxonomySubcategoryDto,
} from "../../../../domains/admin/taxonomy.functions.ts"
import { DashboardSection } from "../../-components/dashboard/index.ts"

export function TaxonomySection({ taxonomy }: { readonly taxonomy: AdminProjectTaxonomyDto }) {
  const subcategoryCount =
    taxonomy.uncategorized.length +
    taxonomy.categories.reduce((sum, category) => sum + category.subcategories.length, 0)

  return (
    <DashboardSection
      title="Taxonomy"
      count={taxonomy.categories.length}
      aside={
        <Text.H6 color="foregroundMuted">
          {subcategoryCount.toLocaleString()} {subcategoryCount === 1 ? "subcategory" : "subcategories"}
        </Text.H6>
      }
    >
      {taxonomy.categories.length === 0 && taxonomy.uncategorized.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
          <Text.H6 color="foregroundMuted">No taxonomy categories or subcategories have been generated yet.</Text.H6>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {taxonomy.categories.map((category) => (
            <div key={category.id} className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text.H5 weight="semibold" ellipsis>
                      {category.name}
                    </Text.H5>
                    {category.state !== "active" ? <Badge variant="outlineMuted">{category.state}</Badge> : null}
                  </div>
                  {category.description ? (
                    <Text.H6 color="foregroundMuted" className="mt-1">
                      {category.description}
                    </Text.H6>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Badge variant="muted">{category.observationCount.toLocaleString()} observations</Badge>
                  <Badge variant="outlineMuted">{category.clusterCount.toLocaleString()} clusters</Badge>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2">
                {category.subcategories.length === 0 ? (
                  <Text.H6 color="foregroundMuted">No subcategories assigned.</Text.H6>
                ) : (
                  category.subcategories.map((subcategory) => (
                    <SubcategoryRow key={subcategory.id} subcategory={subcategory} />
                  ))
                )}
              </div>
            </div>
          ))}

          {taxonomy.uncategorized.length > 0 ? (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <Text.H5 weight="semibold">Uncategorized</Text.H5>
                <Badge variant="outlineMuted">{taxonomy.uncategorized.length.toLocaleString()}</Badge>
              </div>
              <div className="flex flex-col gap-2">
                {taxonomy.uncategorized.map((subcategory) => (
                  <SubcategoryRow key={subcategory.id} subcategory={subcategory} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </DashboardSection>
  )
}

function SubcategoryRow({ subcategory }: { readonly subcategory: AdminTaxonomySubcategoryDto }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Text.H6 weight="medium" ellipsis>
              {subcategory.name}
            </Text.H6>
            {subcategory.state !== "active" ? <Badge variant="outlineMuted">{subcategory.state}</Badge> : null}
          </div>
          {subcategory.description ? (
            <Text.H6 color="foregroundMuted" className="mt-1">
              {subcategory.description}
            </Text.H6>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <Badge variant="muted">{subcategory.observationCount.toLocaleString()} observations</Badge>
          <Text.H6 color="foregroundMuted">last seen {relativeTime(subcategory.lastObservedAt)}</Text.H6>
        </div>
      </div>
    </div>
  )
}
