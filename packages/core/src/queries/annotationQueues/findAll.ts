import { AnnotationQueue } from '../../schema/models/annotationQueues'
import { annotationQueues } from '../../schema/models/annotationQueues'
import { unscopedQuery } from '../scope'
import { tt } from './columns'

export const findAllAnnotationQueues = unscopedQuery(
  async function findAllAnnotationQueues(_filters: {}, db) {
    const result = await db.select(tt).from(annotationQueues)
    return result as AnnotationQueue[]
  },
)
