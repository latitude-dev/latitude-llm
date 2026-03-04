export interface SignupExistingAccountMagicLinkEmailData {
  readonly userName: string
  readonly magicLinkUrl: string
}

export async function signupExistingAccountMagicLinkTemplate(
  data: SignupExistingAccountMagicLinkEmailData,
): Promise<string> {
  return `<p>Hi ${data.userName},</p><p>Looks like this email is already registered in Latitude.</p><p>Use this secure link to sign in to your existing account:</p><p><a href="${data.magicLinkUrl}">${data.magicLinkUrl}</a></p><p>This link expires in 1 hour. If you did not request this, you can safely ignore this email.</p>`
}
