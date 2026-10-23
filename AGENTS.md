# Project Development Guidelines

- Merchant sign-in lives at an unadvertised route, and signed-out `/admin*` visits render not-found. The URL is never the security boundary; password authentication, MFA, and server-side `is_admin()` authorization are. Keep authentication and authorization enforcement intact.

- Product images must be type-checked by file signature and stored with extensions from a fixed MIME map. Storage policies must restrict filenames to jpg/jpeg/png/webp. Never trust client-provided filenames or MIME types; SVG uploads must remain blocked.

- Security headers are configured in `src/server.ts`. Frame, CSP, and HSTS settings apply only to the production host where required. Preserve the development and preview workflows.

- Security regression tests use Bun's built-in test runner: `bun test src`. Do not add another test framework without a clear need.

- Server functions use `.validator()`, not the deprecated `.inputValidator()`.

- Public Supabase URL and publishable key fallbacks are configured in `vite.config.ts`, with environment variables taking precedence. Never put service-role keys, database passwords, payment secrets, private keys, or other server secrets in client-side configuration or committed files.

- Keep the project compatible with its Cloudflare deployment configuration. Test production builds before deploying changes.
