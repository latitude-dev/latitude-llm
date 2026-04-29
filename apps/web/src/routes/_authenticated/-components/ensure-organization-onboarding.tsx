import { Button, Text } from "@repo/ui"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { createProjectMutation, useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import type { ProjectRecord } from "../../../domains/projects/projects.functions.ts"
import { getQueryClient } from "../../../lib/data/query-client.tsx"

const PROJECT_ONBOARDING_PATH = /\/projects\/[^/]+\/onboarding\/?$/

export function EnsureOrganizationOnboarding({ organizationId }: { readonly organizationId: string }) {
  const router = useRouter()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const normalizedPath = pathname.replace(/\/$/, "") || "/"
  const { data: projects, isLoading } = useProjectsCollection()

  const inFlightRef = useRef(false)
  const prevOrganizationIdRef = useRef<string | null>(null)
  const [phase, setPhase] = useState<"idle" | "bootstrapping" | "error">("idle")
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  useEffect(() => {
    if (prevOrganizationIdRef.current !== organizationId) {
      prevOrganizationIdRef.current = organizationId
      inFlightRef.current = false
      setPhase("idle")
      setBootstrapError(null)
    }

    if (isLoading) return
    const count = projects?.length ?? 0
    if (count > 0) {
      inFlightRef.current = false
      setPhase("idle")
      return
    }
    if (PROJECT_ONBOARDING_PATH.test(normalizedPath)) {
      return
    }
    if (inFlightRef.current) return

    inFlightRef.current = true
    setPhase("bootstrapping")

    void (async () => {
      try {
        const queryClient = getQueryClient()
        const { projectId, transaction } = createProjectMutation("My project")
        await transaction.isPersisted.promise
        const list = queryClient.getQueryData<ProjectRecord[]>(["projects"])
        const slug = list?.find((p) => p.id === projectId)?.slug
        if (!slug) {
          setBootstrapError("Could not start onboarding. Create a project from the dashboard or try again.")
          setPhase("error")
          inFlightRef.current = false
          return
        }
        await router.navigate({
          to: "/projects/$projectSlug/onboarding",
          params: { projectSlug: slug },
          replace: true,
        })
      } catch {
        setBootstrapError("Could not start onboarding. Create a project from the dashboard or try again.")
        setPhase("error")
        inFlightRef.current = false
      }
    })()
  }, [isLoading, normalizedPath, organizationId, projects?.length, router])

  if (phase === "bootstrapping") {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background/90 p-6 backdrop-blur-sm">
        <Text.H5 color="foregroundMuted">Setting up your workspace…</Text.H5>
      </div>
    )
  }

  if (phase === "error" && bootstrapError) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background/90 p-6 backdrop-blur-sm">
        <Text.H5 color="foregroundMuted" align="center">
          {bootstrapError}
        </Text.H5>
        <Button
          variant="outline"
          onClick={() => {
            inFlightRef.current = false
            setPhase("idle")
            setBootstrapError(null)
          }}
        >
          Dismiss
        </Button>
      </div>
    )
  }

  return null
}
