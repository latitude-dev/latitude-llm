import { GenerateDatasetContent } from './GenerateDatasetContent'

export default async function GenerateDatasetPage({
  searchParams,
}: {
  searchParams: Promise<{
    parameters?: string
    name?: string
    backUrl?: string
  }>
}) {
  const { parameters, name, backUrl } = await searchParams

  let defaultParameters
  if (parameters) {
    defaultParameters = parameters.split(',')
  }

  return (
    <GenerateDatasetContent
      backUrl={backUrl}
      defaultName={name}
      defaultParameters={defaultParameters}
    />
  )
}
