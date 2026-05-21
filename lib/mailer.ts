import nodemailer from 'nodemailer'
import type { SendMailOptions } from 'nodemailer'

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'one.arlift@arlift.com.ec',
    pass: process.env.SMTP_PASS || 'One2686Lift0620',
  },
})
