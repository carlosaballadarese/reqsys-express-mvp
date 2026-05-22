import nodemailer from 'nodemailer'
import type { SendMailOptions } from 'nodemailer'

// Configuración de transporte de correo corporativo ARLIFT
export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.arlift.com.ec',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE !== 'false', // true para puerto 465 (SSL/TLS)
  auth: {
    user: process.env.SMTP_USER || 'one.arlift@arlift.com.ec',
    pass: process.env.SMTP_PASS || 'One2686Lift0620',
  },
  tls: {
    // No fallar si el certificado es auto-firmado (común en servidores corporativos)
    rejectUnauthorized: false
  }
})
