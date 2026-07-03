import nodemailer from 'nodemailer';

type SendEmailInput = {
  to: string[];
  subject: string;
  html: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST ?? 'vcs.ube-ind.co.jp';
  const port = Number(process.env.SMTP_PORT ?? 25);
  const secure = process.env.SMTP_SECURE === 'true';
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

export async function sendEmail(input: SendEmailInput) {
  const recipients = [...new Set(input.to.map(email => email.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) return;

  const from = process.env.SMTP_FROM ?? 'noreply@ube.co.th';
  await getTransporter().sendMail({
    from,
    to: recipients.join(', '),
    subject: input.subject,
    html: input.html,
  });
}
