'use server'

import jobs from '$/jobs'
import { redirect } from 'next/navigation'

// TODO: Remove this line is just an example of how to enqueue
export async function exampleEnqueue() {
  const job = await jobs.queues.exampleQueue.jobs.enqueueExampleJob({
    patata: 'cociada',
  })

  redirect(`/?jobID=${job.id}`)
}
