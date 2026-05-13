import type { ReportVersion, WrappedReportRecord, WrappedReportType } from "@domain/spans"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { getWrappedReportById } from "../../domains/wrapped/wrapped.functions.ts"
import { TITLE_FOR_KIND } from "./-components/claude-code/v1/personality-copy.ts"
import { WrappedReportV1 } from "./-components/claude-code/v1/WrappedReportV1.tsx"

/**
 * Public Wrapped report. No auth — the CUID `$id` is the only access
 * control. Bypasses the `_authenticated/` layout by living at the top
 * level of `routes/`.
 *
 * The route resolves the persisted record (via `WrappedReportRepository`,
 * which validates the JSONB blob against the type's `SCHEMA_BY_VERSION`)
 * and dispatches to the right renderer based on `(type, reportVersion)`.
 * Today the only type is `claude_code`; future Wrapped types add sibling
 * entries to `RENDERER_BY_TYPE_VERSION` without touching V1 rows.
 */
export const Route = createFileRoute("/wrapped/$id")({
  loader: async ({ params }) => {
    // `getWrappedReportById` returns `null` only on genuine miss; anything
    // else (DB outage, parse failure) propagates as a 500 so it surfaces
    // in logs instead of being silently masked as a 404.
    const record = await getWrappedReportById({ data: { id: params.id } })
    if (!record) throw notFound()
    return { record }
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Claude Code Wrapped" },
          { name: "description", content: "A weekly summary of your Claude Code activity." },
        ],
      }
    }
    const { record } = loaderData
    const archetype = TITLE_FOR_KIND[record.report.personality.kind] ?? "The Wrapped"
    const title = `${record.ownerName}'s Claude Code Wrapped`
    const description = `${record.ownerName} is ${archetype} this week. See the full Wrapped.`
    const ogImage = `/wrapped/${params.id}/og/png`
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:image", content: ogImage },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
    }
  },
  component: WrappedReportPage,
})

/**
 * `(type, reportVersion)` dispatch table. Add a new entry when V2 of an
 * existing type ships or when a new type lands; old rows keep rendering
 * with their frozen renderer.
 */
const RENDERER_BY_TYPE_VERSION = {
  claude_code: { 1: WrappedReportV1 },
} as const satisfies Record<
  WrappedReportType,
  Record<ReportVersion, (props: { record: WrappedReportRecord }) => React.ReactNode>
>

function WrappedReportPage() {
  const { record } = Route.useLoaderData()
  const renderersForType =
    RENDERER_BY_TYPE_VERSION[record.type as WrappedReportType] ?? RENDERER_BY_TYPE_VERSION.claude_code
  // The loader has already validated `record.reportVersion` against the
  // schema map in the repository, so the lookup here is safe.
  const Renderer = renderersForType[record.reportVersion as ReportVersion] ?? renderersForType[1]
  return <Renderer record={record} />
}
