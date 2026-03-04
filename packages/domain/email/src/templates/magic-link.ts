export interface MagicLinkEmailData {
  readonly userName: string
  readonly magicLinkUrl: string
}

export async function magicLinkTemplate(data: MagicLinkEmailData): Promise<string> {
  return `<p>Hi ${data.userName},</p><p>Here's your magic link to access Latitude.</p><p><a href="${data.magicLinkUrl}">${data.magicLinkUrl}</a></p><p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>`
}
