ALTER TABLE latitude.oauth_applications
ADD CONSTRAINT oauth_applications_icon_safe_url
CHECK (
  icon IS NULL
  OR icon ~* '^https?://[^[:space:]]+$'
);
--> statement-breakpoint
ALTER TABLE latitude.oauth_applications
ADD CONSTRAINT oauth_applications_redirect_urls_safe_url_list
CHECK (
  redirect_urls IS NULL
  OR btrim(redirect_urls) = ''
  OR redirect_urls ~* '^\s*(https://[^,[:space:]]+|http://(localhost|127\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])|\[::1\])(:[0-9]+)?[^,[:space:]]*)(\s*,\s*(https://[^,[:space:]]+|http://(localhost|127\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])\.(25[0-5]|2[0-4][0-9]|1?[0-9]?[0-9])|\[::1\])(:[0-9]+)?[^,[:space:]]*))*\s*$'
);
