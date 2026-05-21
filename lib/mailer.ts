import nodemailer from 'nodemailer'
import type { SendMailOptions } from 'nodemailer'

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'reqsys.cabe@gmail.com',
    pass: process.env.SMTP_PASS, // Usará la variable de entorno de Vercel
  },
})
