import { Button, Text } from "@repo/ui"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { completeAuthIntent, signOut } from "../domains/auth/auth.functions.ts"
import { useOrganizationsCollection } from "../domains/organizations/organizations.collection.ts"
import { useProjectsCollection } from "../domains/projects/projects.collection.ts"
import { getSession } from "../domains/sessions/session.functions.ts"

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getSession()

    if (!session) {
      throw redirect({ to: "/login" })
    }

    return { user: session.user }
  },
  component: HomePage,
})

function HomePage() {
  const organizationsCollection = useOrganizationsCollection()
  const firstOrganizationId = organizationsCollection.data?.[0]?.id
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string>()
  const [intentError, setIntentError] = useState<string>()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const authIntentId = searchParams.get("authIntentId")

    if (!authIntentId) {
      return
    }

    void (async () => {
      try {
        await completeAuthIntent({ data: { intentId: authIntentId } })
        window.location.replace("/")
      } catch (error) {
        setIntentError(error instanceof Error ? error.message : "Failed to complete authentication")
      }
    })()
  }, [])

  const handleLogout = async () => {
    if (isLoggingOut) {
      return
    }

    setIsLoggingOut(true)
    setLogoutError(undefined)

    try {
      await signOut()

      window.location.href = "/login"
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoggingOut(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Text.H3>Latitude Dashboard</Text.H3>
        <Text.H6 color="foregroundMuted">Welcome to your Latitude dashboard</Text.H6>
        <Text.H6 color="foregroundMuted">Organizations: {organizationsCollection.data?.length ?? 0}</Text.H6>
        {firstOrganizationId ? <ProjectsCounter organizationId={firstOrganizationId} /> : null}
        {intentError ? <Text.H6 color="destructive">{intentError}</Text.H6> : null}
        {logoutError ? <Text.H6 color="destructive">{logoutError}</Text.H6> : null}
        <Button type="button" onClick={handleLogout} disabled={isLoggingOut}>
          {isLoggingOut ? "Logging out..." : "Logout"}
        </Button>
      </div>
    </div>
  )
}

function ProjectsCounter({ organizationId }: { organizationId: string }) {
  const projectsCollection = useProjectsCollection(organizationId)

  return <Text.H6 color="foregroundMuted">Projects: {projectsCollection.data?.length ?? 0}</Text.H6>
}
