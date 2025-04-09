import { DocumentBlankSlateLayout } from '../../../../../_components/DocumentBlankSlateLayout'
import { BlankSlateButton } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/_components/BlankSlateButton'

export function DocumentLogBlankSlate({ uploadUrl }: { uploadUrl: string }) {
  return (
    <DocumentBlankSlateLayout
      title='There are no logs yet'
      description='Run the prompt in the playground to generate logs or upload logs'
    >
      <BlankSlateButton
        href={uploadUrl}
        title='Upload logs'
        description='Upload logs from your local machine to the project.'
      />
    </DocumentBlankSlateLayout>
  )
}
