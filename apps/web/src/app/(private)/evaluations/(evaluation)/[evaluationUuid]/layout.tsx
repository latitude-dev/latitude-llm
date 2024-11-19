import { ReactNode } from 'react'

import { NotFoundError } from '@latitude-data/core/lib/errors'
import buildMetatags from '$/app/_lib/buildMetatags'
import { getEvaluationByUuidCached } from '$/app/(private)/_data-access'
import type { ResolvingMetadata } from 'next'
import { notFound } from 'next/navigation'

export async function generateMetadata(
  {
    params,
  }: {
    params: Promise<{ evaluationUuid: string }>
  },
  parent: ResolvingMetadata,
) {
  const { evaluationUuid } = await params

  try {
    const evaluation = await getEvaluationByUuidCached(evaluationUuid)

    return buildMetatags({
      title: evaluation.name,
      parent: await parent,
    })
  } catch (error) {
    if (error instanceof NotFoundError) return notFound()
    throw error
  }
}

export default async function EvaluationLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return <>{children}</>
}
