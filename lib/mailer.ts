import nodemailer from 'nodemailer'
import type { SendMailOptions } from 'nodemailer'

// Crea una nueva conexión SMTP en cada envío para garantizar
// que siempre usa las credenciales actuales del entorno.
export const transporter = {
  sendMail(options: SendMailOptions) {
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
    return t.sendMail(options)
  },
}
