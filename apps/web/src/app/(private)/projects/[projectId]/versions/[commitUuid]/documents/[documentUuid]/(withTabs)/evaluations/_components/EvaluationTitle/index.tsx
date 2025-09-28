import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClickToCopyUuid } from '@latitude-data/web-ui/organisms/ClickToCopyUuid'
import { BreadcrumbSeparator } from '@latitude-data/web-ui/molecules/Breadcrumb'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import Link from 'next/link'
import { EvaluationBadge } from './EvaluationBadge'
import { EvaluationV2 } from '@latitude-data/core/constants'

export function EvaluationTitle({
  evaluation,
  subSection,
  backHref,
}: {
  evaluation: EvaluationV2
  backHref?: string
  subSection?: string
}) {
  const Cmp = backHref ? Link : 'div'
  return (
    <div className='flex flex-col gap-2 min-w-0'>
      <div className='flex flex-row items-center gap-x-1 min-w-0'>
        <Cmp
          href={backHref ?? '#'}
          className='flex flex-row items-center gap-x-1 min-w-0'
        >
          {backHref ? (
            <Icon name='chevronLeft' color='foregroundMuted' />
          ) : null}
          <Text.H4M noWrap ellipsis>
            {evaluation.name}
          </Text.H4M>
        </Cmp>
        {subSection ? (
          <>
            <BreadcrumbSeparator />
            <Text.H4 color='foregroundMuted'>{subSection}</Text.H4>
          </>
        ) : null}
        <div className='ml-2'>
          <ClickToCopyUuid uuid={evaluation.uuid} />
        </div>
      </div>
      <EvaluationBadge evaluation={evaluation} />
    </div>
  )
}
