import { Alert, Button, useLocalStorage } from "@repo/ui"
import { XIcon } from "lucide-react"

export function ToolsDiscoveryBanner({ projectId }: { readonly projectId: string }) {
  const { value: dismissed, setValue: setDismissed } = useLocalStorage<boolean>({
    key: `projects.tools.discovery-banner-dismissed.v1.${projectId}`,
    defaultValue: false,
  })
  if (dismissed) return null
  return (
    <Alert
      description="These tools were detected automatically from tool definitions on your LLM spans — none have been called in this window. Open a tool to see where it's offered."
      cta={
        <Button variant="ghost" size="icon-xs" onClick={() => setDismissed(true)} aria-label="Dismiss">
          <XIcon className="h-4 w-4" />
        </Button>
      }
    />
  )
}
