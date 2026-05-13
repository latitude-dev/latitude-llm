import type { ReportVersion, WrappedReportRecord } from "@domain/spans"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { getWrappedReportById } from "../../domains/cc-wrapped/cc-wrapped.functions.ts"
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
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData ? `Claude Code Wrapped — ${loaderData.record.report.project.name}` : "Claude Code Wrapped",
      },
      {
        name: "description",
        content: loaderData
          ? `${loaderData.record.ownerName}'s Claude Code week in ${loaderData.record.report.project.name}.`
          : "A weekly summary of your team's Claude Code activity.",
      },
    ],
  }),
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
