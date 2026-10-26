'use client'
import { signOut } from 'next-auth/react'
import styles from './Lobby.module.css'
import ThemeToggle from '@/components/ThemeToggle'
import InstallButton from './InstallButton'

export default function LobbyHeader({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <header className={styles.header}>
      <div className={styles.logo}><span className={styles.logoMark}>自</span>自習室 JP</div>
      <div className={styles.headerRight}>
        <InstallButton />
        <ThemeToggle />
        <span className={styles.avatar}>{avatarUrl ? <img src={avatarUrl} alt=""/> : name[0]}</span>
        <button className={styles.logout} onClick={() => signOut({ callbackUrl: '/' })}>ログアウト</button>
      </div>
    </header>
  )
}
