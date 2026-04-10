import { getRouteApi } from "@tanstack/react-router"

/**
 * Centralizes access to the authenticated layout route's loader data.
 *
 * Keeping `getRouteApi("/_authenticated")` here avoids scattering the string
 * route id across descendant routes and lets those files avoid importing the
 * parent `Route` object directly.
 */
const authenticatedRoute = getRouteApi("/_authenticated")

/** Reads the authenticated user from the parent route's cached loader data. */
export function useAuthenticatedUser() {
  return authenticatedRoute.useLoaderData({ select: (data) => data.user })
}

/** Reads the active organization id from the parent route's cached loader data. */
export function useAuthenticatedOrganizationId() {
  return authenticatedRoute.useLoaderData({ select: (data) => data.organizationId })
}
