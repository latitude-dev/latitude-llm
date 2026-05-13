import type { ReportVersion, WrappedReportRecord } from "@domain/spans"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { getWrappedReportById } from "../../domains/cc-wrapped/cc-wrapped.functions.ts"
import { TITLE_FOR_KIND } from "./-components/v1/personality-copy.ts"
import { WrappedReportV1 } from "./-components/v1/WrappedReportV1.tsx"

/**
 * Public Claude Code Wrapped report. No auth — the CUID `$id` is the only
 * access control. Bypasses the `_authenticated/` layout by living at the
 * top level of `routes/`.
 *
 * The route resolves the persisted record (via WrappedReportRepository,
 * which validates the JSONB blob against SCHEMA_BY_VERSION[reportVersion])
 * and dispatches to a version-scoped renderer below. When V2 ships, add a
 * V2 component + a new entry in RENDERER_BY_VERSION; V1 rows keep working.
 */
export const Route = createFileRoute("/cc-wrapped/$id")({
  loader: async ({ params }) => {
    try {
      return { record: await getWrappedReportById({ data: { id: params.id } }) }
    } catch {
      // The repo throws NotFoundError on miss; collapse to a 404.
      throw notFound()
    }
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
    const ogImage = `/cc-wrapped/${params.id}/og/png`
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

const RENDERER_BY_VERSION: Record<ReportVersion, (props: { record: WrappedReportRecord }) => React.ReactNode> = {
  1: WrappedReportV1,
}

function WrappedReportPage() {
  const { record } = Route.useLoaderData()
  // The loader has already validated `record.reportVersion` against the
  // SCHEMA_BY_VERSION map in the repository, so the cast here is safe.
  const Renderer = RENDERER_BY_VERSION[record.reportVersion as ReportVersion] ?? RENDERER_BY_VERSION[1]
  return <Renderer record={record} />
}
