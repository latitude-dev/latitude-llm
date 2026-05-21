import { BotIcon } from "lucide-react"
import { Icon, type IconProps } from "../../icons.tsx"
import { BRAND_ICON_MAP } from "./brand-map.ts"

export interface BrandIconProps extends Omit<IconProps, "icon"> {
  /**
   * Brand identifier — matches `integrations.kind` (`"slack"` today,
   * `"telegram"` / `"discord"` / `"github-app"` later). Unknown values
   * fall back to a generic bot icon.
   */
  brand: string
}

export function BrandIcon({ brand, ...props }: BrandIconProps) {
  const IconComponent = BRAND_ICON_MAP[brand.toLowerCase()] ?? BotIcon
  return <Icon icon={IconComponent} {...props} />
}
