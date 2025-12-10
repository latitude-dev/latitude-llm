import { AlignmentMetricMetadata } from '@latitude-data/constants'
import { EVALUATION_ALIGNMENT_EXPLANATION } from '@latitude-data/constants/issues'

export function ConfusionMatrixTooltipContent({
  confusionMatrix,
}: {
  confusionMatrix?: AlignmentMetricMetadata['confusionMatrix']
}) {
  return (
    <div className='flex flex-col gap-2'>
      <div>{EVALUATION_ALIGNMENT_EXPLANATION}</div>
      <ConfusionMatrixTable confusionMatrix={confusionMatrix} />
    </div>
  )
}

function ConfusionMatrixTable({
  confusionMatrix,
}: {
  confusionMatrix?: AlignmentMetricMetadata['confusionMatrix']
}) {
  if (!confusionMatrix) {
    return null
  }

  return (
    <div className='flex flex-col gap-2'>
      <table className='border-collapse'>
        <thead>
          <tr>
            <th className='p-2 text-center text-xs font-medium'>
              Confusion Matrix
            </th>
            <th className='border-l p-2 text-center text-xs font-medium'>
              Actually Positive
            </th>
            <th className='p-2 text-center text-xs font-medium'>
              Actually Negative
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className='border-t border-border p-2 text-center text-xs font-medium'>
              Predicted Positive
            </td>
            <td className='border-t border-l border-border p-2 text-center text-xs'>
              {confusionMatrix.truePositives} (TP)
            </td>
            <td className='border-t border-border p-2 text-center text-xs'>
              {confusionMatrix.falsePositives} (FP)
            </td>
          </tr>
          <tr>
            <td className='border-t border-border p-2 text-center text-xs font-medium'>
              Predicted Negative
            </td>
            <td className='border-t border-l border-border p-2 text-center text-xs'>
              {confusionMatrix.falseNegatives} (FN)
            </td>
            <td className='border-t border-border p-2 text-center text-xs'>
              {confusionMatrix.trueNegatives} (TN)
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
