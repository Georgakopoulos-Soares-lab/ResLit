'use server'

import { headers } from 'next/headers'
import { findCuratorByEmail, createCurator, updateCuratorPassword, markEmailVerified } from '@/lib/auth/curators'
import { createVerificationToken, consumeVerificationToken, peekVerificationToken } from '@/lib/auth/verification'
import { createSession } from '@/lib/auth/session'
import { verifyPassword } from '@/lib/auth/password'
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/auth/email'

async function getBaseUrl(): Promise<string> {
  const h = await headers()
  const host = h.get('host')
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  return `${protocol}://${host}`
}

export async function signUp(
  email: string,
  password: string,
  name: string,
  affiliation: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await findCuratorByEmail(email)
    if (existing) {
      return { success: false, error: 'An account with this email already exists.' }
    }

    const curator = await createCurator({ email, password, name, affiliation })
    const token = await createVerificationToken(curator.id, 'verify')
    const baseUrl = await getBaseUrl()
    await sendVerificationEmail(email, `${baseUrl}/auth/verify?token=${token}`)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Sign-up failed' }
  }
}

export async function resendVerificationEmail(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const curator = await findCuratorByEmail(email)
    // Don't leak whether the email is registered or already verified.
    if (curator && !curator.emailVerifiedAt) {
      const token = await createVerificationToken(curator.id, 'verify')
      const baseUrl = await getBaseUrl()
      await sendVerificationEmail(email, `${baseUrl}/auth/verify?token=${token}`)
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not resend email' }
  }
}

/** Called by the /auth/verify route handler. Marking verified + creating the
 * session happen together so a successful verify lands the curator straight
 * in the dashboard, matching the previous Supabase-auth UX. */
export async function verifyEmail(token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await consumeVerificationToken(token, 'verify')
    if (!result.success || !result.curatorId) {
      return { success: false, error: result.error || 'Invalid or expired link' }
    }

    await markEmailVerified(result.curatorId)
    await createSession(result.curatorId)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Verification failed' }
  }
}

export async function login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const curator = await findCuratorByEmail(email)
    if (!curator) {
      return { success: false, error: 'Invalid email or password' }
    }

    const valid = await verifyPassword(password, curator.passwordHash)
    if (!valid) {
      return { success: false, error: 'Invalid email or password' }
    }

    if (!curator.emailVerifiedAt) {
      return {
        success: false,
        error: 'Please verify your email before logging in. Check your inbox for the verification link.',
      }
    }

    await createSession(curator.id)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Login failed' }
  }
}

export async function requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const curator = await findCuratorByEmail(email)
    if (curator) {
      const token = await createVerificationToken(curator.id, 'reset')
      const baseUrl = await getBaseUrl()
      await sendPasswordResetEmail(email, `${baseUrl}/curator/reset-password?token=${token}`)
    }
    // Always succeed, regardless of whether the email was found — avoids
    // leaking which addresses have curator accounts.
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not send reset email' }
  }
}

export async function checkResetToken(token: string): Promise<{ valid: boolean }> {
  return peekVerificationToken(token, 'reset')
}

export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await consumeVerificationToken(token, 'reset')
    if (!result.success || !result.curatorId) {
      return { success: false, error: result.error || 'Invalid or expired link' }
    }

    await updateCuratorPassword(result.curatorId, newPassword)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to reset password' }
  }
}
