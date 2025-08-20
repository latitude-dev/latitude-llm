import Mailgun from 'mailgun.js'
import type { MessageData, MessagesSendResult } from 'mailgun.js/definitions'
import formData from 'form-data'
import consolidate from 'consolidate'
import { Options as NodemailerMail } from 'nodemailer/lib/mailer'
import type { Transport, TransportOptions } from 'nodemailer'
import MailMessage from 'nodemailer/lib/mailer/mail-message'

type WhitelistEntry = string | RegExp | [string | RegExp, string]

const whitelist: WhitelistEntry[] = [
  ['replyTo', 'h:Reply-To'],
  ['messageId', 'h:Message-Id'],
  /^h:/,
  /^v:/,
  'from',
  'to',
  'cc',
  'bcc',
  'subject',
  'text',
  'template',
  'html',
  'attachment',
  'inline',
  'recipient-variables',
  'o:tag',
  'o:campaign',
  'o:dkim',
  'o:deliverytime',
  'o:testmode',
  'o:tracking',
  'o:tracking-clicks',
  'o:tracking-opens',
  'o:require-tls',
  'o:skip-verification',
  'X-Mailgun-Variables',
]

export const applyKeyWhitelist = (mail: Record<string, unknown>) =>
  Object.keys(mail).reduce<Record<string, unknown>>((acc, key) => {
    const targetKey = whitelist.reduce<string | null>((result, cond) => {
      if (result) return result

      if (Array.isArray(cond)) {
        const [match, target] = cond
        if ((match instanceof RegExp && match.test(key)) || match === key) {
          return target
        }
      } else if (cond instanceof RegExp && cond.test(key)) {
        return key
      } else if (cond === key) {
        return key
      }
      return null
    }, null)

    if (!targetKey || !mail[key]) return acc
    return { ...acc, [targetKey]: mail[key] }
  }, {})

interface LocalTemplate {
  engine: keyof typeof consolidate
  name: string
  context?: Record<string, unknown>
}

export const renderTemplate = async (
  mail: NodemailerMail & { template?: string | LocalTemplate },
): Promise<{ template: null; html?: string }> => {
  if (mail.html) {
    return { template: null, html: mail.html as string }
  }
  if (
    !mail.template ||
    typeof mail.template === 'string' ||
    !mail.template.name ||
    !mail.template.engine
  ) {
    return { template: null }
  }

  const { engine, name, context = {} } = mail.template
  const html = await (consolidate as any)[engine](name, context)
  return { template: null, html }
}

export const makeMailgunAttachments = (
  attachments: NodemailerMail['attachments'] = [],
) => {
  const [attachment, inline] = (attachments || []).reduce<[any[], any[]]>(
    (results, item) => {
      if (!item) return results
      const data =
        typeof item.content === 'string'
          ? Buffer.from(item.content, item.encoding as BufferEncoding)
          : item.content || (item as any).path || undefined

      const att = {
        data,
        filename: (item as any).cid || item.filename || undefined,
        contentType: item.contentType || undefined,
        knownLength: (item as any).knownLength || undefined,
      }

      const [attList, inlineList] = results
      return [
        attList.concat(!(item as any).cid ? att : []),
        inlineList.concat((item as any).cid ? att : []),
      ]
    },
    [[], []],
  )

  return {
    ...(attachment.length ? { attachment } : {}),
    ...(inline.length ? { inline } : {}),
  }
}

export const makeAllTextAddresses = <T extends unknown>(mail: MailMessage<T>) => {
  const keys = ['from', 'to', 'cc', 'bcc', 'replyTo'] as const

  const makeTextAddresses = (addresses: any) => {
    const validAddresses = ([] as any[]).concat(addresses).filter(Boolean)
    const textAddresses = validAddresses.map((item) =>
      item?.address
        ? item.name
          ? `${item.name} <${item.address}>`
          : item.address
        : typeof item === 'string'
          ? item
          : null,
    )
    return textAddresses.filter(Boolean).join()
  }

  return keys.reduce<Record<string, string>>((result, key) => {
    const textAddresses = makeTextAddresses((mail as any)[key])
    if (!textAddresses) return result
    return { ...result, [key]: textAddresses }
  }, {})
}

export const send =
  <T = unknown>(mailgunSend: (mail: MailMessage<T>) => Promise<MessagesSendResult>) =>
    async (
      { data: mail }: { data: NodemailerMail },
      callback: (err: Error | null, res?: T) => void,
    ) => {
      try {
        const addresses = makeAllTextAddresses(mail)
        const attachments = makeMailgunAttachments(mail.attachments)
        const template = await renderTemplate(mail)

        const extendedMail = {
          ...mail,
          ...addresses,
          ...attachments,
          ...template,
        }

        const whitelistedMail = applyKeyWhitelist(extendedMail)
        const result = await mailgunSend(
          whitelistedMail as unknown as MessageData,
        )

        callback(null, { ...result, messageId: result.id })
      } catch (error) {
        callback(error as Error)
      }
    }

interface Options extends TransportOptions {
  url?: string
  host?: string
  protocol?: string
  port?: number
  timeout?: number
  auth: {
    domain: string
    apiKey: string
  }
}

export const transport = (options: Options): Transport<MessagesSendResult> => {
  const mailgun = new Mailgun(formData)

  let url = options.url
  if (!options.url && options.host) {
    const generatedUrl = new URL(
      'https://' + (options.host || 'api.mailgun.net'),
    )
    generatedUrl.protocol = options.protocol || 'https:'
    generatedUrl.port = options.port ? String(options.port) : '443'
    url = generatedUrl.href
  }

  const messages = mailgun.client({
    username: 'api',
    key: options.auth.apiKey,
    url,
    timeout: options.timeout,
  }).messages

  const mailgunSend = (mail: MessageData) =>
    messages.create(options.auth.domain || '', mail)

  return {
    name: 'Mailgun',
    version: '1.0.0',
    send: send(mailgunSend),
  }
}

// expose helpers for testing
transport._send = send
transport._makeAllTextAddresses = makeAllTextAddresses
transport._makeMailgunAttachments = makeMailgunAttachments
transport._renderTemplate = renderTemplate
transport._applyKeyWhitelist = applyKeyWhitelist

export default transport
