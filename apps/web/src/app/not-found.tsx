import buildMetatags from '$/app/_lib/buildMetatags'
import { NotFoundPageComponent } from '$/components/NotFound'
import { ROUTES } from '$/services/routes'

export const metadata = buildMetatags({
  title: 'Not found',
})

export default async function GlobalNoFoundPage() {
  return (
    <NotFoundPageComponent
      route={ROUTES.root}
      label='Go back to the homepage'
      message="We couldn't find what you are looking for. Please make sure that the page exists and try again."
    />
  )
}
