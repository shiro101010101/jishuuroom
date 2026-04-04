// app/page.tsx
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import LoginClient from '@/components/auth/LoginClient'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect('/room/00000000-0000-0000-0000-000000000001')
  const { error } = await searchParams
  return <LoginClient error={error} />
}
