import { cn } from '../../../../lib/utils'
import { Button, Icon, IconName, Text } from '../../../atoms'
import { TruncatedTooltip } from '../../TruncatedTooltip'
import { ReactNode } from 'react'
import { BackgroundColor, colors, TextColor } from '../../../tokens'

export function ContentCard({
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
}) {
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
}

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

      {children}
    </div>
  )
}

export function CardTextContent({
  value,
  color,
}: {
  value: string
  color: TextColor
}) {
  return (
    <ContentCardContainer copy={value}>
      {value.split('\n').map((line, i) => (
        <Text.H5 key={i} color={color}>
          {line}
        </Text.H5>
      ))}
    </ContentCardContainer>
  )
}
