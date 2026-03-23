import { ArrowRightIcon } from "lucide-react"
import { ProviderIcon } from "../icons/custom-icons/providers/provider-icon.tsx"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"
import { Tooltip } from "../tooltip/tooltip.tsx"

export interface ModelBadgeProps {
  readonly provider: string
  readonly model: string
  readonly responseModel?: string
  readonly collapsed?: boolean
}

export function ModelBadge({ provider, model, responseModel, collapsed }: ModelBadgeProps) {
  if (!provider && !model) return null

  const showResponseModel = responseModel && responseModel !== model

  const providerIcon = provider ? (
    collapsed ? (
      <Tooltip trigger={<ProviderIcon provider={provider} size="sm" />}>{provider}</Tooltip>
    ) : (
      <ProviderIcon provider={provider} size="sm" />
    )
  ) : null

  return (
    <div className="flex flex-row items-center gap-2 bg-secondary rounded-full px-2 py-0.5 w-fit">
      {providerIcon}
      {!collapsed && provider && <Text.H5 color="foregroundMuted">{provider}</Text.H5>}

      {provider && model && <div className="w-px self-stretch bg-border shrink-0 -my-0.5" />}

      {collapsed ? (
        <Text.H5 color="foregroundMuted">{responseModel ?? model}</Text.H5>
      ) : (
        <>
          {model && (
            <Text.H5 color="foregroundMuted" noWrap>
              {model}
            </Text.H5>
          )}

          {showResponseModel && (
            <>
              <Icon icon={ArrowRightIcon} size="sm" color="foregroundMuted" />
              <Text.H5 color="foregroundMuted" noWrap>
                {responseModel}
              </Text.H5>
            </>
          )}
        </>
      )}
    </div>
  )
}
