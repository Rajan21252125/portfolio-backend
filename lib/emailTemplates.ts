// src/lib/emailTemplates.ts
import * as fs from "fs/promises";           // or: import { readFile } from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { sendEmail } from "./email.ts"; // your nodemailer wrapper
import { logger } from "./logger.ts";    // adjust path if needed

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function simpleReplace(html: string, data: Record<string, any>) {
  return html.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key) => {
    const val = key.split(".").reduce((acc: any, k: string) => acc?.[k], data);
    return val === undefined || val === null ? "" : String(val);
  });
}

async function findTemplate(templatePath: string) {
  // if absolute, just return it if exists
  if (path.isAbsolute(templatePath)) {
    try {
      await fs.access(templatePath);
      return templatePath;
    } catch {}
  }

  // candidate bases in order
  const candidates = [
    path.join(process.cwd(), templatePath),                      // relative to project root
    path.join(process.cwd(), "lib", templatePath),              // projectRoot/lib/...
    path.join(process.cwd(), "mailTemplates", templatePath),    // projectRoot/mailTemplates/...
    path.join(__dirname, templatePath),                         // relative to current file
    path.join(__dirname, "mailTemplates", templatePath),        // lib/... relative
  ];

  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      // try next
    }
  }

  // if none found, throw with the candidates we tried
  const tried = candidates.join("\n - ");
  const err: any = new Error(`Template not found. Tried:\n - ${tried}`);
  (err as any).tried = candidates;
  throw err;
}

/**
 * Send an HTML template. templatePath may be:
 *  - absolute path, or
 *  - relative path such as "mailTemplates/user_verification_email.html" or "lib/mailTemplates/..."
 */
export async function sendTemplatedEmail(
  templatePath: string,
  data: Record<string, any>,
  mailOptions: { to: string; subject: string; from?: string }
) {
  try {
    const realPath = await findTemplate(templatePath);
    let html = await fs.readFile(realPath, "utf-8");

    // replace placeholders ({{key}})
    html = simpleReplace(html, data);

    // send
    await sendEmail(mailOptions.to, mailOptions.subject, html);
    logger.info({ to: mailOptions.to, template: realPath }, "Templated email sent");
    return true;
  } catch (err) {
    logger.error({ err, templatePath, to: mailOptions.to }, "Failed to send templated email");
    throw err;
  }
}
