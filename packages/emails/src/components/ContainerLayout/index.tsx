import React, { ReactNode } from 'react'

import { env } from '@latitude-data/env'
import {
  Body,
  Column,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
} from '@react-email/components'
import { Fonts } from '../Fonts'
import tailwindEmail from '../tailwind.email'
import { LATITUDE_LOGO_URL } from '../../constants'
import { Button } from '../Button'
import { Text } from '../Text'

export type ContainerLayoutProps = {
  children: ReactNode
  title?: string
  previewText: string
  footer?: ReactNode
}
export default function ContainerLayout({
  children,
  title,
  previewText,
  footer,
}: ContainerLayoutProps) {
  const rootUrl = env.APP_URL
  return (
    <Html>
      <Head>
        <Fonts />
      </Head>
      <Preview>{previewText}</Preview>
      <Tailwind config={tailwindEmail}>
        <Body className='bg-secondary m-0'>
          <Container className='py-6 px-2'>
            <Section className='pb-8'>
              <Row>
                <Column align='left'>
                  <Link href={rootUrl} className='text-center'>
                    <Img
                      src={LATITUDE_LOGO_URL}
                      alt="Latitude's Logo"
                      width='132'
                      height='24'
                    />
                  </Link>
                </Column>
                <Column align='right'>
                  <Button href={rootUrl} variant='outline'>
                    Open Latitude
                  </Button>
                </Column>
              </Row>
            </Section>
            <Section className='bg-white rounded-2xl px-6 py-8 border border-border'>
              {title && (
                <Section className='mb-4'>
                  <Text.H2B>{title}</Text.H2B>
                </Section>
              )}
              {children}
              {footer ? (
                <Section className='pt-6 border-t border-dashed mt-8 border-border'>
                  {footer}
                </Section>
              ) : null}
            </Section>
            <Section className='mt-8' align='center'>
              <div className='mb-1'>
                <Text.H5M display='block' align='center'>
                  Latitude Data S.L.
                </Text.H5M>
              </div>
              <div className='mb-1'>
                <Text.H5 display='block' align='center' color='foregroundMuted'>
                  The AI engineering platform for product teams.
                </Text.H5>
              </div>
              <Link href='https://app.latitude.so'>
                <Text.H5 display='block' align='center' color='primary'>
                  latitude.so
                </Text.H5>
              </Link>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}
