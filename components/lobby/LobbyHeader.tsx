'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import styles from './Lobby.module.css'
import ThemeToggle from '@/components/ThemeToggle'
import InstallButton from './InstallButton'
import ProfileEditModal, { type EditableProfile } from '@/components/profile/ProfileEditModal'

export default function LobbyHeader({ profile }: { profile: EditableProfile }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [me, setMe] = useState(profile)
  return (
    <header className={styles.header}>
      <div className={styles.logo}><span className={styles.logoMark}>自</span>自習室 JP</div>
      <div className={styles.headerRight}>
        <InstallButton />
        <ThemeToggle />
        <button className={styles.avatar} onClick={() => setEditing(true)} title="プロフィールを編集" aria-label="プロフィールを編集">
          {me.avatar_url ? <img src={me.avatar_url} alt=""/> : me.display_name[0]}
        </button>
        <button className={styles.logout} onClick={() => signOut({ callbackUrl: '/' })}>ログアウト</button>
      </div>
      {editing && (
        <ProfileEditModal profile={me} onClose={() => setEditing(false)}
          onSaved={p => { setMe(p); router.refresh() }}/>
      )}
    </header>
  )
}
