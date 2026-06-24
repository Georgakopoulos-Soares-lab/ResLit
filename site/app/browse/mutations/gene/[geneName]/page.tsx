import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ geneName: string }>
}

export default async function GeneMutationsRedirect({ params }: PageProps) {
  const { geneName } = await params
  redirect(`/browse/genes/${geneName}`)
}
