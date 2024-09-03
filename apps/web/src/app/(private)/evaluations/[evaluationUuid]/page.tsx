import { Text } from '@latitude-data/web-ui'

export default async function DocumentPage({
  params: _,
}: {
  params: { evaluationUuid: string }
}) {
  return (
    <div className='w-full h-[600px] flex flex-col items-center justify-center'>
      <Text.H4>(Really cool dashboard)</Text.H4>
    </div>
  )
}
