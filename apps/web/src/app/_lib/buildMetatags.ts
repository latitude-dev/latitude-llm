import type { Metadata, ResolvedMetadata } from 'next'

const DEFAULT_TITLE = 'The Open-Source LLM Development Platform'
const DEFAULT_DESCRIPTION =
  'Latitude is an end-to-end platform for prompt engineering where domain experts can collaborate with engineers to ship and maintain production-grade LLM features.'

// This function is necessary to define default metadata correctly, because
// Nextjs metadata merging would overwrite the nested objects totally.
export default function buildMetatags({
  title,
  description,
  parent,
}: {
  title?: string
  description?: string
  parent?: ResolvedMetadata
}): Metadata {
  let parentTitle = parent?.title?.absolute || ''
  let metaTitle =
    title && parentTitle
      ? `${title} - ${parentTitle}`
      : title || parentTitle || DEFAULT_TITLE
  if (!metaTitle.endsWith(' - Latitude')) metaTitle += ' - Latitude'

  const metaDescription = description || DEFAULT_DESCRIPTION

  return {
    // FIXME: use env.LATITUDE_URL (is broken when building production) instead
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
  }
}
