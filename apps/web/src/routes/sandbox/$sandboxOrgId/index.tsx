import { createFileRoute, redirect } from "@tanstack/react-router"
import { resolveDefaultSandboxProjectSlug } from "../../../domains/sandbox/sandbox-navigation.functions.ts"

/**
 * Sandbox landing. Mirrors the Live landing (`/_authenticated/`): resolves the
 * sandbox's current project (last-visited cookie, else first) and redirects into
 * its traces. With no projects yet, sends the user to the manage page to add one.
 */
export const Route = createFileRoute("/sandbox/$sandboxOrgId/")({
  loader: async ({ params }) => {
    const slug = await resolveDefaultSandboxProjectSlug({
      data: { sandboxOrgId: params.sandboxOrgId },
    })
    if (!slug) {
      throw redirect({
        to: "/sandbox/$sandboxOrgId/manage",
        params: { sandboxOrgId: params.sandboxOrgId },
      })
    }
    throw redirect({
      to: "/sandbox/$sandboxOrgId/projects/$projectSlug",
      params: { sandboxOrgId: params.sandboxOrgId, projectSlug: slug },
    })
  },
})
