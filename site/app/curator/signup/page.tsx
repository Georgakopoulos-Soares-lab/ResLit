'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type Step = 'form' | 'check-email'

export default function CuratorSignupPage() {
  const [step, setStep] = useState<Step>('form')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  // ── Step 1: create account ────────────────────────────────────
  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name, affiliation: institution },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/curator/dashboard`,
        },
      })

      if (signUpError) throw signUpError

      // Show email check screen - user needs to click link in email
      setStep('check-email')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign-up failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Resend confirmation link ──────────────────────────────────
  const handleResend = async () => {
    setError(null)
    setResent(false)
    setLoading(true)

    try {
      const supabase = createClient()
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/curator/dashboard`,
        },
      })

      if (resendError) throw resendError

      setResent(true)
    } catch (err: unknown) {
      console.error('Resend error:', err)
      const errorMsg = err instanceof Error ? err.message : 'Could not resend email'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {step === 'form' ? (
            <Card className="border-border/60">
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                    <svg className="h-6 w-6 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                </div>
                <CardTitle className="text-2xl">Apply as Curator</CardTitle>
                <CardDescription>
                  Create your curator account to start curating AMR data
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignup} className="flex flex-col gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="Dr. Jane Smith"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="institution">Institution</Label>
                    <Input
                      id="institution"
                      type="text"
                      placeholder="University of Athens"
                      required
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@institution.edu"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="At least 8 characters"
                      minLength={8}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Creating account…
                      </span>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link href="/curator/login" className="text-primary hover:underline">
                    Sign in
                  </Link>
                </p>
              </CardContent>
            </Card>
          ) : step === 'check-email' ? (
            <Card className="border-border/60">
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                    <svg className="h-6 w-6 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
                <CardTitle className="text-2xl">Check your email</CardTitle>
                <CardDescription>
                  We sent a confirmation link to{' '}
                  <span className="font-medium text-foreground">{email}</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <p className="text-sm text-muted-foreground text-center">
                  Click the link in the email to verify your address and activate your curator account. The link expires in 1 hour.
                </p>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {resent && (
                  <Alert className="border-green-200 bg-green-50 text-green-800">
                    <AlertDescription>A new confirmation link was sent to {email}.</AlertDescription>
                  </Alert>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleResend}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending…
                    </span>
                  ) : (
                    'Resend confirmation link'
                  )}
                </Button>

                <p className="text-center text-sm text-muted-foreground">
                  Wrong email?{' '}
                  <button
                    type="button"
                    onClick={() => { setStep('form'); setError(null); setResent(false) }}
                    className="text-primary hover:underline"
                  >
                    Go back and change it
                  </button>
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>

      <Footer />
    </div>
  )
}
