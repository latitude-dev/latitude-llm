import { Fragment } from 'react'

import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentTrigger } from '@latitude-data/core/schema/models/types/DocumentTrigger'
import { useState } from 'react'
import { TriggerCard } from './index'
import { RunTriggerProps } from '../types'

export function TriggersList({
  triggers,
  commit,
  handleRun,
}: {
  triggers: DocumentTrigger[]
  commit: Commit
  handleRun: (props: RunTriggerProps) => void
}) {
  const [openTriggerUuid, setOpenTriggerUuid] = useState<string>()

  if (triggers.length === 0) return null

  return (
    <div className='w-full flex flex-col border border-border rounded-xl'>
      {triggers.map((trigger, index) => (
        <Fragment key={trigger.uuid}>
          {index > 0 ? <div className='w-full h-px bg-border' /> : null}

          <TriggerCard
            trigger={trigger}
            commit={commit}
            isOpen={openTriggerUuid === trigger.uuid}
            onOpenChange={(open) => {
              setOpenTriggerUuid(open ? trigger.uuid : undefined)
            }}
            handleRun={handleRun}
          />
        </Fragment>
      ))}
    </div>
  )
}
