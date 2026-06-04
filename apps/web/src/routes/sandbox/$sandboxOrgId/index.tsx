import { Button, Icon, Text } from "@repo/ui"
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

const sandboxRoute = getRouteApi("/sandbox/$sandboxOrgId")

/**
 * Stub landing page for a Test Mode sandbox. Proves the
 * `/sandbox/:sandboxOrgId` parent-route gate (`route.tsx`) wires the
 * `sandboxMiddleware`-authorized `getSandbox` result into route context;
 * the real sandbox UI (traces list, settings, Live ⇄ Sandbox switch)
 * lands in later Test Mode tickets and reads the same context.
 */
export const Route = createFileRoute("/sandbox/$sandboxOrgId/")({
  component: SandboxStubPage,
})

function SandboxStubPage() {
  const sandbox = sandboxRoute.useRouteContext({ select: (c) => c.sandbox })

  return (
    <div className="flex flex-col gap-4 p-6">
      <Text.H3>Sandbox: {sandbox.name}</Text.H3>
      <div>
        <Button asChild variant="outline" size="sm">
          <Link to="/">
            <Icon icon={ArrowLeft} size="sm" />
            Back to live
          </Link>
        </Button>
      </div>
    </div>
  )
}
