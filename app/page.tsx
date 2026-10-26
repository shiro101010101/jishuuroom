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
  if (session?.user) redirect('/lobby')
  const { error } = await searchParams
  return <LoginClient error={error} />
}
