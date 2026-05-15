import type { ReportVersion, WrappedReportRecord, WrappedReportType } from "@domain/spans"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { getWrappedPageData } from "../../domains/wrapped/wrapped.functions.ts"
import { TITLE_FOR_KIND } from "./-components/claude-code/v1/personality-copy.ts"
import { WrappedReportV1 } from "./-components/claude-code/v1/WrappedReportV1.tsx"

/**
 * Public Wrapped report. The CUID `$id` is the access token for *seeing
 * the page*; what's *rendered* further depends on viewer identity.
 *
 * `getWrappedPageData` checks the session and looks up org membership.
 * Members of the wrapped's organization receive the full record;
 * everyone else (logged-out OR logged-in-but-not-a-member) receives a
 * server-side-redacted record — workspace names, filenames, top bash
 * command, and per-workspace deep-dives are stripped before the data
 * crosses the wire.
 *
 * The route dispatches the renderer on `(type, reportVersion)` as before;
 * each renderer reads `isMember` to pick the right layout.
 */
export const Route = createFileRoute("/wrapped/$id")({
  loader: async ({ params }) => {
    const result = await getWrappedPageData({ data: { id: params.id } })
    if (!result.found) throw notFound()
    return { record: result.record, isMember: result.isMember, loggedIn: result.loggedIn }
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
  Record<ReportVersion, (props: { record: WrappedReportRecord; isMember: boolean }) => React.ReactNode>
>

function WrappedReportPage() {
  const { record, isMember } = Route.useLoaderData()
  const renderersForType =
    RENDERER_BY_TYPE_VERSION[record.type as WrappedReportType] ?? RENDERER_BY_TYPE_VERSION.claude_code
  // The loader has already validated `record.reportVersion` against the
  // schema map in the repository, so the lookup here is safe.
  const Renderer = renderersForType[record.reportVersion as ReportVersion] ?? renderersForType[1]
  return <Renderer record={record} isMember={isMember} />
}
