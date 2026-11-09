import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter = null;

function getTransporter() {
  if (!env.smtp.host) return null;
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

function verificationHtml(verifyUrl, clientSetup = false) {
  return `
    <p>Hello,</p>
    ${clientSetup ? "<p>Click to confirm your email and choose a password.</p>" : "<p>Thanks for registering an administrator account for Project E-Noise.</p>"}
    <p><a href="${verifyUrl}">${clientSetup ? "Click to confirm your email and choose a password" : "Click here to verify your email address"}</a> (link expires in 24 hours).</p>
    <p>If the link doesn't work, copy and paste this URL into your browser:<br>${verifyUrl}</p>
    ${clientSetup ? "<p>If you didn't request this, ignore this email; no account access is granted until you set a password.</p>" : ""}
  `;
}

export async function sendVerificationEmail({ to, verifyUrl, clientSetup = false }) {
  const client = getTransporter();

  if (!client) {
    // No SMTP configured — log it so registration/login can be exercised
    // end-to-end during development without a mail provider.
    // eslint-disable-next-line no-console
    console.log(
      `\n[emailService] (console fallback -- set SMTP_* in .env to send real email)\n` +
        `  To:      ${to}\n` +
        `  Subject: ${clientSetup ? "Finish setting up your Project E-Noise account" : "Verify your Project E-Noise administrator account"}\n` +
        `  Link:    ${verifyUrl}\n` +
        (clientSetup ? "  Message: Click to confirm your email and choose a password. If you didn't request this, ignore this email; no account access is granted until you set a password.\n" : "")
    );
    return;
  }

  await client.sendMail({
    from: env.smtp.from,
    to,
    subject: clientSetup ? "Finish setting up your Project E-Noise account" : "Verify your Project E-Noise administrator account",
    html: verificationHtml(verifyUrl, clientSetup)
  });
}
