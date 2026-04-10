import { useRouter } from "@tanstack/react-router"
import type { ComponentType } from "react"
import { useMatchIdsWithStaticData } from "../../../lib/hooks/use-router-selectors.ts"
import { BreadcrumbSeparator } from "./breadcrumb-ui.tsx"

/**
 * Renders `staticData.breadcrumb` components for each active match (in tree order).
 * Each segment is prefixed with `BreadcrumbSeparator` to match the org crumb style in `NavHeader`.
 * The outer flex row is the segment shell; a segment may return a fragment of `BreadcrumbLink`,
 * `BreadcrumbText`, and `BreadcrumbSeparator` from `breadcrumb-ui.tsx`.
 */
export function BreadcrumbTrail() {
  const router = useRouter()
  const crumbIds = useMatchIdsWithStaticData((staticData) => typeof staticData?.breadcrumb === "function")
  const crumbs = router.state.matches.flatMap((match) => {
    if (!crumbIds.includes(match.id)) return []
    const staticData = match.staticData as { breadcrumb?: unknown } | undefined
    if (typeof staticData?.breadcrumb !== "function") return []
    return [{ id: match.id, Breadcrumb: staticData.breadcrumb as ComponentType }]
  })

  return (
    <>
      {crumbs.map(({ id, Breadcrumb }) => {
        return (
          <span key={id} className="flex items-center gap-2 min-w-0">
            <BreadcrumbSeparator />
            <Breadcrumb />
          </span>
        )
      })}
    </>
  )
}
