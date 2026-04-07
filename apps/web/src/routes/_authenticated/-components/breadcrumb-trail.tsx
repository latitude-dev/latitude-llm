import { useMatches } from "@tanstack/react-router"
import type { ComponentType } from "react"
import { BreadcrumbSeparator } from "./breadcrumb-ui.tsx"

/**
 * Renders `staticData.breadcrumb` components for each active match (in tree order).
 * Each segment is prefixed with `BreadcrumbSeparator` to match the org crumb style in `NavHeader`.
 * The outer flex row is the segment shell; a segment may return a fragment of `BreadcrumbLink`,
 * `BreadcrumbText`, and `BreadcrumbSeparator` from `breadcrumb-ui.tsx`.
 */
export function BreadcrumbTrail() {
  const matches = useMatches()
  const crumbs = matches.filter(
    (m): m is typeof m & { staticData: { breadcrumb: ComponentType } } =>
      m.staticData !== undefined && typeof (m.staticData as { breadcrumb?: unknown }).breadcrumb === "function",
  )

  return (
    <>
      {crumbs.map((match) => {
        const Breadcrumb = match.staticData.breadcrumb
        return (
          <span key={match.id} className="flex items-center gap-2 min-w-0">
            <BreadcrumbSeparator />
            <Breadcrumb />
          </span>
        )
      })}
    </>
  )
}
