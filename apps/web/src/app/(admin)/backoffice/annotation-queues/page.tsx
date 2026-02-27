'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import { AnnotationQueuesManager } from './_components/AnnotationQueuesManager'

export default function AdminAnnotationQueues() {
  return (
    <div className='container flex flex-col gap-y-8'>
      <section className='flex flex-col gap-y-4'>
        <Text.H1>Annotation Queues</Text.H1>
        <Text.H4 color='foregroundMuted'>
          Create annotation queues for projects and manually add traces to them
          during BETA.
        </Text.H4>
        <AnnotationQueuesManager />
      </section>
    </div>
  )
}
