import { LatitudeLogo, Text } from "@repo/ui"
import type { ReactNode } from "react"
import { GtmNoScript, SignupCompleteWatcher } from "../lib/analytics/signup-complete-watcher.tsx"

export function AuthScreen({
  title,
  description,
  children,
}: {
  readonly title?: string
  readonly description?: string
  readonly children: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <GtmNoScript />
      <SignupCompleteWatcher />
      <div className="flex flex-col gap-y-6 max-w-[22rem] w-full">
        <div className="flex flex-col items-center justify-center gap-y-6">
          <LatitudeLogo />
          {title || description ? (
            <div className="flex flex-col items-center justify-center gap-y-2">
              {title ? <Text.H3 align="center">{title}</Text.H3> : null}
              {description ? (
                <Text.H5 color="foregroundMuted" align="center">
                  {description}
                </Text.H5>
              ) : null}
            </div>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  )
}
