// src/lib/email.ts
import * as nodemailer from "nodemailer";
const host = process.env.SMTP_HOST;
const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.FROM_EMAIL || "no-reply@example.com";
if (!host || !user || !pass) {
    console.warn("SMTP not fully configured. Emails will fail if attempted.");
}
export async function sendEmail(to, subject, html) {
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
            user,
            pass,
        },
    });
    return transporter.sendMail({
        from,
        to,
        subject,
        html,
    });
}
