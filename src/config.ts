/**
 * Central configuration — single source of truth for all environment variables.
 * Import `config` instead of reading `process.env` directly in service files.
 */
export const config = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  // Note: "MAKRET" is a legacy typo in the deployed env var name — kept for backward compatibility
  cmcApiKey: process.env.COIN_MAKRET_CAP_API_KEY ?? '',
  isProd: process.env.NODE_ENV === 'production',
  email: {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    smtpHost: process.env.EMAIL_SMTP_HOST,
    smtpPort: parseInt(process.env.EMAIL_SMTP_PORT ?? '587', 10),
    smtpUser: process.env.EMAIL_SMTP_USER,
    smtpPass: process.env.EMAIL_SMTP_PASS,
  },
};
