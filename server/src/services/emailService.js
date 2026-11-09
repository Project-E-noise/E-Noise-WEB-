import nodemailer from "nodemailer";
import { env } from "../config/env.js";

// Sends emails one of three ways, picked by EMAIL_PROVIDER:
//   brevo -> Brevo HTTP API (works on Render free, which blocks SMTP ports)
//   smtp  -> any SMTP server (handy for local development, e.g. Gmail)
//   (empty) -> no email is sent; the link is printed in the server console
// Also falls back to SMTP when SMTP_HOST is set but EMAIL_PROVIDER is not,
// so older .env files keep working.

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/** Splits "Project E-Noise <no-reply@example.com>" into name and email. */
function parseFrom(from) {
  const match = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/.exec(from);
  return match ? { name: match[1].trim() || undefined, email: match[2].trim() } : { email: from.trim() };
}

function provider() {
  if (env.email.provider) return env.email.provider;
  return env.smtp.host ? "smtp" : "console";
}

let transporter = null;
function smtpTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined
    });
  }
  return transporter;
}

async function sendWithBrevo({ to, subject, html, text }) {
  if (!env.email.brevoApiKey) throw new Error("EMAIL_PROVIDER=brevo but BREVO_API_KEY is not set.");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.email.brevoApiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: parseFrom(env.email.from), to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo responded ${res.status}: ${detail.slice(0, 200)}`);
  }
}

// In tests, emails are kept here instead of being sent, so a test can read the link.
export const testOutbox = [];

/** Sends one email. Throws if the provider rejects it. */
export async function sendEmail({ to, subject, html, text }) {
  if (env.nodeEnv === "test") {
    testOutbox.push({ to, subject, html, text });
    return;
  }
  const mode = provider();
  if (mode === "brevo") return sendWithBrevo({ to, subject, html, text });
  if (mode === "smtp") return smtpTransporter().sendMail({ from: env.email.from, to, subject, html, text });

  // Console fallback for local development.
  // eslint-disable-next-line no-console
  console.log(`\n[email] (not sent - set EMAIL_PROVIDER to send real email)\n  To:      ${to}\n  Subject: ${subject}\n${text}\n`);
}

export async function sendVerificationEmail({ to, verifyUrl, clientSetup = false }) {
  const subject = clientSetup ? "Finish setting up your Project E-Noise account" : "Verify your Project E-Noise administrator account";
  const intro = clientSetup
    ? "Click the link below to confirm your email and choose a password."
    : "Thanks for registering an administrator account for Project E-Noise. Click the link below to verify your email.";
  const outro = clientSetup ? "If you didn't request this, ignore this email. No account access is granted until you set a password." : "";
  const linkText = clientSetup ? "Confirm email and choose a password" : "Verify my email address";
  const url = escapeHtml(verifyUrl);

  const html = `
    <p>Hello,</p>
    <p>${escapeHtml(intro)}</p>
    <p><a href="${url}">${escapeHtml(linkText)}</a> (link expires in 24 hours)</p>
    <p>If the link doesn't work, copy and paste this address into your browser:<br>${url}</p>
    ${outro ? `<p>${escapeHtml(outro)}</p>` : ""}`;
  const text = `${intro}\n\n  Link: ${verifyUrl}\n\nThe link expires in 24 hours.${outro ? `\n\n${outro}` : ""}`;

  await sendEmail({ to, subject, html, text });
}
