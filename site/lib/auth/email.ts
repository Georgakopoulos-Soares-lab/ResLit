import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'ResLit <onboarding@resend.dev>'

/**
 * Without RESEND_API_KEY set (e.g. local dev before a Resend account exists),
 * falls back to logging the link to the console instead of sending real email.
 */
async function send(to: string, subject: string, html: string, text: string, devLabel: string, url: string) {
  if (!resend) {
    console.log(`\n[dev email] ${devLabel}\n  to: ${to}\n  link: ${url}\n`)
    return
  }
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html, text })
  if (error) {
    console.error(`[email] Resend failed to send "${subject}" to ${to}:`, error)
    throw new Error(`Failed to send email: ${error.message}`)
  }
}

export async function sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
  await send(
    to,
    'Verify your ResLit curator account',
    `<p>Click the link below to verify your email and activate your curator account:</p>
     <p><a href="${verifyUrl}">${verifyUrl}</a></p>
     <p>This link expires in 24 hours.</p>`,
    `Click the link below to verify your email and activate your curator account:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    'Verify curator account',
    verifyUrl
  )
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await send(
    to,
    'Reset your ResLit password',
    `<p>Click the link below to reset your password:</p>
     <p><a href="${resetUrl}">${resetUrl}</a></p>
     <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
    `Click the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    'Reset password',
    resetUrl
  )
}
