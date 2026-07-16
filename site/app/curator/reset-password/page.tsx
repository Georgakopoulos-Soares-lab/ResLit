import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { ResetPasswordForm } from '@/components/curator/reset-password-form'

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <ResetPasswordForm token={token ?? null} />
        </div>
      </main>

      <Footer />
    </div>
  )
}
