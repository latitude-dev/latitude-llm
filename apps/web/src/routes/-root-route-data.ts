import { getRouteApi } from "@tanstack/react-router"

const rootRoute = getRouteApi("__root__")

export function useRootThemePreference() {
  return rootRoute.useLoaderData({ select: (data) => data.theme })
}
