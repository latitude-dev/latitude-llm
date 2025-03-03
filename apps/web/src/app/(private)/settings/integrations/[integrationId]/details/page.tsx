import { McpServerLogsModal } from './_components/McpServerLogsModal'

export default async function IntegrationDetailsPage({
  params,
}: {
  params: Promise<{ integrationId: string }>
}) {
  const p = await params

  return <McpServerLogsModal integrationId={parseInt(p.integrationId, 10)} />
}
