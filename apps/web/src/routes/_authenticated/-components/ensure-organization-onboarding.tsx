import { Button, Text } from "@repo/ui"
import { useRouter, useRouterState } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { useProjectsCollection } from "../../../domains/projects/projects.collection.ts"
import { createProject } from "../../../domains/projects/projects.functions.ts"

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
    void createProject({ data: { name: "My project" } })
      .then((created) =>
        router.navigate({
          to: "/projects/$projectSlug/onboarding",
          params: { projectSlug: created.slug },
        }),
      )
      .catch(() => {
        setBootstrapError("Could not start onboarding. Create a project from the dashboard or try again.")
        setPhase("error")
        inFlightRef.current = false
      })
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
