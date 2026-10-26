import nodemailer from "nodemailer";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

export async function sendMail(input: { to: string; subject: string; heading: string; body: string; url: string; action: string; detail: string }) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpFrom = process.env.SMTP_FROM;
  const smtpUsername = process.env.SMTP_USERNAME;
  const smtpPassword = process.env.SMTP_PASSWORD;
  if (!smtpHost || !smtpFrom) {
    throw new Error("Email is not configured. Set SMTP_HOST and SMTP_FROM on the server.");
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    requireTLS: port === 587,
    ...(smtpUsername ? {
      auth: { user: smtpUsername, pass: smtpPassword },
    } : {}),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const h = escapeHtml;
  try {
    await transport.sendMail({
      from: smtpFrom,
      to: input.to,
      subject: input.subject.replace(/[\r\n]/g, " ").slice(0, 200),
      text: `${input.heading}\n\n${input.body}\n\n${input.action}: ${input.url}\n\n${input.detail}\n\nIf you weren't expecting this email, you can ignore it.`,
      html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(input.subject)}</title></head><body style="margin:0;background:#f7f7f5;color:#20201e;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;padding:32px 16px"><tr><td align="center"><table role="presentation" style="max-width:520px;width:100%;background:#fff;border:1px solid #ddd;padding:32px"><tr><td><p style="font-size:20px;font-weight:700">twello</p><h1 style="font-size:24px;line-height:1.3">${h(input.heading)}</h1><p style="font-size:16px;line-height:1.6">${h(input.body)}</p><p style="margin:28px 0"><a href="${h(input.url)}" style="display:inline-block;padding:14px 22px;background:#20201e;color:#fff;text-decoration:none;border-radius:4px;font-size:16px">${h(input.action)}</a></p><p style="font-size:14px;line-height:1.6">${h(input.detail)}</p><p style="font-size:14px;line-height:1.6;overflow-wrap:anywhere">Or open this link<br><a href="${h(input.url)}">${h(input.url)}</a></p><p style="font-size:12px;color:#666;line-height:1.6">If you weren't expecting this email, you can ignore it.</p></td></tr></table></td></tr></table></body></html>`,
    });
  } finally {
    transport.close();
  }
}

export async function sendBoardInvite(input: { to: string; inviterName: string; boardTitle: string; role: "editor" | "viewer"; url: string; expiresAt: string | Date }) {
  await sendMail({
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.boardTitle}`,
    heading: `Join ${input.boardTitle}`,
    body: `${input.inviterName} invited you to collaborate on this board as ${input.role === "editor" ? "an editor" : "a viewer"}. Sign in with ${input.to} to accept.`,
    url: input.url,
    action: "Accept invitation",
    detail: `This invitation expires on ${new Date(input.expiresAt).toLocaleDateString("en-AU", { dateStyle: "long", timeZone: "UTC" })}.`,
  });
}
