import nodemailer from 'nodemailer'
import type { SendMailOptions } from 'nodemailer'

// Configuración de transporte de correo corporativo ARLIFT (Puerto 465 SSL)
export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.arlift.com.ec',
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true, // Siempre true para puerto 465
  auth: {
    user: process.env.SMTP_USER || 'one.arlift@arlift.com.ec',
    pass: process.env.SMTP_PASS || 'One2686Lift0620',
  },
  tls: {
    // Necesario para muchos servidores cPanel/empresariales
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2'
  }
})
