import nodemailer, { Transporter } from 'nodemailer';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from '../config';

function createTransporter(): Transporter {
  return nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpPort === 465,
    auth: {
      user: config.email.smtpUser,
      pass: config.email.smtpPass,
    },
  });
}

/**
 * Convert plain-text analysis to styled HTML.
 * BUY / SELL / HOLD signal lines get colour-coded highlights.
 */
function analysisToHtml(analysis: string): string {
  const escaped = analysis
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const highlighted = escaped
    .replace(
      /(SIGNAL[^\n]*BUY[^\n]*)/gi,
      '<span style="background:#d4edda;padding:2px 6px;border-radius:4px;font-weight:bold;">$1</span>',
    )
    .replace(
      /(SIGNAL[^\n]*SELL[^\n]*)/gi,
      '<span style="background:#f8d7da;padding:2px 6px;border-radius:4px;font-weight:bold;">$1</span>',
    )
    .replace(
      /(SIGNAL[^\n]*HOLD[^\n]*)/gi,
      '<span style="background:#fff3cd;padding:2px 6px;border-radius:4px;font-weight:bold;">$1</span>',
    );

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#f4f4f4; margin:0; padding:20px; }
    .card { background:#fff; border-radius:8px; max-width:750px; margin:0 auto; padding:32px; box-shadow:0 2px 8px rgba(0,0,0,.08); }
    h2 { color:#1a1a2e; margin-top:0; }
    .meta { color:#888; font-size:13px; margin-bottom:24px; }
    pre { font-family: "SF Mono", "Fira Code", monospace; font-size:13px; line-height:1.7; white-space:pre-wrap; background:#f8f9fa; border-radius:6px; padding:20px; }
    .disclaimer { margin-top:24px; font-size:11px; color:#aaa; border-top:1px solid #eee; padding-top:12px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>🤖 Crypto AI Analyst — Hourly Report</h2>
    <div class="meta">Generated: ${new Date().toUTCString()}</div>
    <pre>${highlighted}</pre>
    <div class="disclaimer">⚠️ This is an automated AI analysis. Not financial advice. Always do your own research before trading.</div>
  </div>
</body>
</html>`;
}

/**
 * Send via AWS SES SDK — used in Lambda (no SMTP credentials needed, uses IAM role).
 */
async function sendViaSES(subject: string, text: string, html: string): Promise<void> {
  const client = new SESClient({});
  await client.send(new SendEmailCommand({
    Source: config.email.from,
    Destination: { ToAddresses: [config.email.to!] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Text: { Data: text, Charset: 'UTF-8' },
        Html: { Data: html, Charset: 'UTF-8' },
      },
    },
  }));
  console.log(`[Notifier] Email sent via SES to ${config.email.to}`);
}

/**
 * Send via SMTP (nodemailer) — used for local development.
 */
async function sendViaSMTP(subject: string, text: string, html: string): Promise<void> {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"Crypto AI Agent" <${config.email.from}>`,
    to: config.email.to,
    subject,
    text,
    html,
  });
  console.log(`[Notifier] Email sent via SMTP to ${config.email.to}`);
}

/**
 * Send the analysis report via email.
 * Uses SES SDK when EMAIL_SMTP_HOST is not set (Lambda), SMTP otherwise (local dev).
 */
export async function sendNotification(analysis: string): Promise<void> {
  const subject = `Crypto Signal [${new Date().toUTCString()}] — BTC/ETH/XRP/SOL`;
  const html = analysisToHtml(analysis);

  if (config.email.smtpHost) {
    await sendViaSMTP(subject, analysis, html);
    return;
  }

  await sendViaSES(subject, analysis, html);
}
