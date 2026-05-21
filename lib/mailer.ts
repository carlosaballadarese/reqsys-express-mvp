import nodemailer from 'nodemailer'
import type { SendMailOptions } from 'nodemailer'

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.arlift.com.ec',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE !== 'false', // True para puerto 465
  auth: {
    user: process.env.SMTP_USER || 'one.arlift@arlift.com.ec',
    pass: process.env.SMTP_PASS || 'One2686Lift0620',
  },
})
