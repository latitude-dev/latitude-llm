import React, { ReactNode } from 'react'

import { env } from '@latitude-data/env'
import {
  Body,
  Font,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components'

export default function PlainLayout({
  children,
  title,
  previewText,
  footerText = 'The Latitude Team',
}: {
  children: ReactNode
  title?: string
  previewText: string
  footerText?: string | string[]
}) {
  const rootUrl = env.APP_URL
  return (
    <Html>
      <Head>
        <Font
          fontFamily='IBM Plex Mono'
          fallbackFontFamily='Verdana'
          webFont={{
            url: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F6pfjptAgt5VM-kVkqdyU8n1ioa2HdgregdFOFh.woff2',
            format: 'woff2',
          }}
          fontWeight={400}
          fontStyle='normal'
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body>
        <Tailwind>
          <Section className='bg-white rounded-lg'>
            {title && (
              <Heading
                as='h1'
                className='text-gray-900 text-2xl font-bold mb-4 p-0'
              >
                {title}
              </Heading>
            )}
            {children}
            <Section className='pt-4'>
              {Array.isArray(footerText) ? (
                footerText.map((text) => (
                  <Text key={text} className='text-gray-500 text-sm'>
                    {text}
                  </Text>
                ))
              ) : (
                <Text className='text-gray-500 text-sm'>{footerText}</Text>
              )}
            </Section>
          </Section>
          <Section className='w-full'>
            <Link href={rootUrl} className='text-center'>
              <Img
                src={`${rootUrl}/logodark.png`}
                width='32'
                height='32'
                alt="Latitude's Logo"
                className='mx-auto'
              />
            </Link>
          </Section>
        </Tailwind>
      </Body>
    </Html>
  )
}
