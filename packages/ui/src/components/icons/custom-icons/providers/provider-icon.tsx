import { BotIcon } from "lucide-react"
import { Icon, type IconProps } from "../../icons.tsx"
import { PROVIDER_ICON_MAP } from "./provider-map.ts"

export interface ProviderIconProps extends Omit<IconProps, "icon"> {
  provider: string
}

export function ProviderIcon({ provider, ...props }: ProviderIconProps) {
  const supportedIcon = PROVIDER_ICON_MAP[provider]
  const IconComponent = supportedIcon ?? BotIcon
  return <Icon icon={IconComponent} {...props} />
}
