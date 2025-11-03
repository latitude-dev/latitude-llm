import type { Metadata, ResolvedMetadata } from 'next'

const DEFAULT_TITLE = 'The Agent Engineering Platform'
const DEFAULT_DESCRIPTION =
  'Latitude is the platform for building and running AI agents without code. With Latte, you can create complex automations using a single prompt. Latitude handles everything: creating the agents, connecting them to 2,500+ tools, and deploying them into production.'

// This function is necessary to define default metadata correctly, because
// Nextjs metadata merging would overwrite the nested objects totally.
export default async function buildMetatags({
  title,
  description,
  locationDescription,
  parent,
}: {
  title?: string
  description?: string
  locationDescription?: string
  parent?: ResolvedMetadata
}): Promise<Metadata> {
  let parentTitle = parent?.title?.absolute || ''
  let metaTitle =
    title && parentTitle
      ? `${title} - ${parentTitle}`
      : title || parentTitle || DEFAULT_TITLE
  if (!metaTitle.endsWith(' - Latitude')) metaTitle += ' - Latitude'

  let closestLocationDescription =
    locationDescription || parent?.other?.['location-description']

  const metaDescription = description || DEFAULT_DESCRIPTION

  return {
    // FIXME: use env.APP_URL (is broken when building production) instead
    metadataBase: new URL('https://app.latitude.so'),
    title: metaTitle,
    description: metaDescription,
    openGraph: {
      // Note, og:url is not set because there is no way to get
      // the current url in server components, other than hacks
      // like getting it from the HTTP headers...
      type: 'website',
      siteName: 'Latitude',
      title: metaTitle,
      description: metaDescription,
    },
    twitter: {
      card: 'summary',
      title: metaTitle,
      description: metaDescription,
    },
    ...(closestLocationDescription
      ? {
          other: {
            'location-description': closestLocationDescription,
          },
        }
      : {}),
  }
}
