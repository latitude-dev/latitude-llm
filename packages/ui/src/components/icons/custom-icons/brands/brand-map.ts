import { BotIcon, type LucideProps } from "lucide-react"
import type { ComponentType } from "react"
import { SlackIcon } from "./icons/index.tsx"

type BrandIconComponent = ComponentType<LucideProps>

/**
 * Brand marks for third-party services Latitude integrates with
 * (Slack today; Telegram, Discord, GitHub Apps later). Keyed by the
 * `integrations.kind` discriminator so a `<BrandIcon brand={kind} />`
 * resolves to the right mark at render time.
 *
 * Distinct from `providers/provider-map.ts` (AI model providers) and
 * from `@repo/ui`'s `brand-icons` folder (Google / GitHub for OAuth
 * login buttons, `BrandIconProps` shape).
 */
export const BRAND_ICON_MAP: Record<string, BrandIconComponent> = {
  /** Fallback for unrecognised brands. */
  generic: BotIcon,
  slack: SlackIcon,
}
