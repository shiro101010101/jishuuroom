'use client'
// 「アプリとして追加」ボタン。Android / PC の Chrome はそのままインストール、iPhone は手順を案内する
import { useEffect, useState } from 'react'
import { Icon } from '@/components/room/Icons'
import styles from './Lobby.module.css'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function InstallButton() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [installed, setInstalled] = useState(true)

  useEffect(() => {
    const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    setInstalled(standalone)
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent) }
    const onInstalled = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  if (installed || (!prompt && !isIos)) return null

  async function install() {
    if (prompt) { await prompt.prompt(); await prompt.userChoice; setPrompt(null) }
    else setShowIosHelp(true)
  }

  return (
    <>
      <button className={styles.install} onClick={install}>
        <Icon name="download" size={15} /><span>アプリとして追加</span>
      </button>
      {showIosHelp && (
        <div className={styles.sheetBg} onClick={() => setShowIosHelp(false)}>
          <div className={styles.sheet} onClick={e => e.stopPropagation()}>
            <div className={styles.sheetTitle}>ホーム画面に追加</div>
            <ol className={styles.sheetSteps}>
              <li>Safari の下にある <b>共有ボタン</b>（□に↑）をタップ</li>
              <li><b>「ホーム画面に追加」</b>を選ぶ</li>
              <li>右上の<b>「追加」</b>をタップ</li>
            </ol>
            <p className={styles.sheetNote}>ホーム画面のアイコンから、アプリのように全画面で開けます。</p>
            <button className={styles.sheetClose} onClick={() => setShowIosHelp(false)}>OK</button>
          </div>
        </div>
      )}
    </>
  )
}
