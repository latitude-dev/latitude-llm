import { NOTIFICATION_GROUP_META, type NotificationGroup } from "@domain/shared"
import { Link, Text } from "@react-email/components"
// @ts-expect-error TS6133 - React required at runtime for JSX in workers
// biome-ignore lint/correctness/noUnusedImports: React required at runtime for JSX in workers
import React from "react"
import { emailDesignTokens } from "../tokens/design-system.js"

interface EmailFooterProps {
  readonly unsubscribe?: {
    readonly webAppUrl: string
    readonly group: NotificationGroup
  }
}

/**
 * Shared, optional footer dropped into `ContainerLayout`'s `footer` slot.
 * Renders an unsubscribe row when `unsubscribe` is set, nothing otherwise —
 * safe to pass to any template, even transactional ones that should never
 * carry an opt-out (magic links, invites, exports).
 *
 * The link goes through the generic `/settings/<section>` redirect, which
 * resolves the user's current project at click time. That means the URL
 * keeps working even after the project the email referenced is deleted,
 * and we never need to embed a project slug in the email body.
 */
export function EmailFooter({ unsubscribe }: EmailFooterProps) {
  if (!unsubscribe) return null
  const base = unsubscribe.webAppUrl.replace(/\/$/, "")
  const url = `${base}/settings/account?group=${unsubscribe.group}`
  const label = NOTIFICATION_GROUP_META[unsubscribe.group].label
  return (
    <Text className={`${emailDesignTokens.typography.bodySmall} text-muted-foreground text-center m-0`}>
      You're receiving this because you have <strong>{label}</strong> emails turned on.{" "}
      <Link href={url} className="text-primary underline">
        Unsubscribe
      </Link>
    </Text>
  )
}
