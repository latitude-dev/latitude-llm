import { memo, ReactNode, useMemo } from 'react'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import { TruncatedTooltip } from '@latitude-data/web-ui/molecules/TruncatedTooltip'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  BackgroundColor,
  colors,
  TextColor,
} from '@latitude-data/web-ui/tokens'

export const ContentCard = memo(
  ({
    label,
    icon,
    bgColor = 'bg-yellow',
    fgColor = 'warningForeground',
    info,
    infoColor,
    children,
    resultFooter,
    separatorColor = 'mutedForeground',
  }: {
    label: string
    icon?: IconName
    bgColor: string
    fgColor: TextColor
    info?: string
    infoColor?: TextColor
    children: ReactNode
    resultFooter?: ReactNode
    separatorColor?: BackgroundColor
  }) => {
    return (
      <div className='py-2 w-full'>
        <div className='overflow-hidden rounded-xl w-full flex-col bg-backgroundCode'>
          <div
            className={cn(
              'flex w-full px-2 py-0.5 items-center gap-2 justify-between',
              bgColor,
              { 'py-1': !info },
            )}
          >
            <div className='flex items-center gap-1.5'>
              {icon && <Icon name={icon} color={fgColor} />}
              <TruncatedTooltip content={label}>
                <Text.H6 noWrap color={fgColor}>
                  {label}
                </Text.H6>
              </TruncatedTooltip>
            </div>
            {info && (
              <TruncatedTooltip content={info}>
                <Text.H6 color={infoColor ?? fgColor} ellipsis>
                  {info}
                </Text.H6>
              </TruncatedTooltip>
            )}
          </div>
          {children}
          {resultFooter && (
            <>
              <div
                className={cn(
                  'w-full h-px opacity-25',
                  colors.backgrounds[separatorColor],
                )}
              />
              {resultFooter}
            </>
          )}
        </div>
      </div>
    )
  },
)

export function ContentCardContainer({
  children,
  copy,
}: {
  children: ReactNode
  copy?: string
}) {
  const copyToClipboard = () => {
    if (!copy) return
    navigator.clipboard.writeText(copy)
  }

  return (
    <div className='relative w-full p-4 bg-backgroundCode flex flex-col gap-2'>
      {copy && (
        <div className='absolute top-2 right-0'>
          <Button
            variant='ghost'
            iconProps={{ name: 'clipboard' }}
            onClick={copyToClipboard}
          />
        </div>
      )}

      {useMemo(() => children, [children])}
    </div>
  )
}

export const CardTextContent = memo(
  ({ value, color }: { value: string; color: TextColor }) => {
    return (
      <ContentCardContainer copy={value}>
        <Text.H5 color={color}>{value}</Text.H5>
      </ContentCardContainer>
    )
  },
)
