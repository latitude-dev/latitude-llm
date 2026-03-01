/**
 * Magic Link email template
 *
 * Simple HTML email template for Magic Link authentication.
 * Matches the legacy Latitude design.
 */

export interface MagicLinkEmailData {
  readonly userName: string;
  readonly magicLinkUrl: string;
}

export const magicLinkTemplate = (data: MagicLinkEmailData): string => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Log in to Latitude</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f9fafb; border-radius: 8px; padding: 32px; margin: 20px 0;">
    <h2 style="margin-top: 0; color: #111;">Hi ${escapeHtml(data.userName)},</h2>
    <p style="font-size: 16px; color: #555;">Here's your magic link to access Latitude.</p>
    
    <div style="margin: 32px 0;">
      <a href="${escapeHtml(data.magicLinkUrl)}" 
         style="display: inline-block; background: #000; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
        Access Latitude
      </a>
    </div>
    
    <p style="font-size: 14px; color: #888; margin-top: 32px;">
      This link will expire in 1 hour and can only be used once.
    </p>
  </div>
  
  <p style="font-size: 12px; color: #aaa; text-align: center;">
    If you didn't request this email, you can safely ignore it.
  </p>
</body>
</html>
  `.trim();
};

// Simple HTML escaping to prevent XSS
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};
