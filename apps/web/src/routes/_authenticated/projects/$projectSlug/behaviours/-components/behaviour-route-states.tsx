import { Button, Icon, Text } from "@repo/ui"
import { Link } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { ListingLayout as Layout } from "../../../../../../layouts/ListingLayout/index.tsx"

/** Waiting on the behaviors list to resolve which behavior (or view) the URL names. */
export function BehaviourRouteLoading() {
  return (
    <Layout>
      <Layout.Content>
        <div className="flex flex-1 items-center justify-center p-8">
          <Icon icon={Loader2Icon} size="md" color="foregroundMuted" className="animate-spin" />
        </div>
      </Layout.Content>
    </Layout>
  )
}

export function BehaviourNotFound({ projectSlug }: { readonly projectSlug: string }) {
  return (
    <Layout>
      <Layout.Content>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <Text.H3>Behavior not found</Text.H3>
          <Button asChild variant="outline">
            <Link to="/projects/$projectSlug/behaviours" params={{ projectSlug }}>
              Back to behaviors
            </Link>
          </Button>
        </div>
      </Layout.Content>
    </Layout>
  )
}
