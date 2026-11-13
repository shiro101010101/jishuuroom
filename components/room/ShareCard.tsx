'use client'
// components/room/ShareCard.tsx — 今日の勉強記録を画像にして SNS で共有する（画像は端末の中だけで作る）
import { useEffect, useRef, useState } from 'react'
import styles from './ShareCard.module.css'
import { track } from '@/lib/analytics'

type Props = {
  lang: 'ja' | 'en'
  displayName: string
  todaySeconds: number
  pomosToday: number
  streak: number
  week: { day_of_week: number; total_seconds: number }[]
  onToast: (msg: string) => void
  /** ボタンを出さず、openSignal が変わったときだけ開く（ポモドーロ完了時の自動表示用） */
  hideButton?: boolean
  openSignal?: number
}

const W = 1080, H = 1350

function fmtHM(s: number, ja: boolean) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return ja ? (h > 0 ? `${h}時間${m}分` : `${m}分`) : (h > 0 ? `${h}h ${m}m` : `${m}m`)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}

function draw(canvas: HTMLCanvasElement, p: Props, origin: string) {
  const ja = p.lang === 'ja'
  const ctx = canvas.getContext('2d')!
  canvas.width = W; canvas.height = H
  const font = (w: number, s: number) => `${w} ${s}px "Zen Kaku Gothic New", "Hiragino Sans", "Noto Sans JP", sans-serif`

  // 夜空の背景
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0b1026'); bg.addColorStop(.55, '#141a3a'); bg.addColorStop(1, '#241b3f')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * .8, H * .15, 0, W * .8, H * .15, 520)
  glow.addColorStop(0, 'rgba(125,149,255,.35)'); glow.addColorStop(1, 'rgba(125,149,255,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
  // 星（毎回同じ配置）
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${.15 + rnd() * .5})`
    ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H * .6, rnd() * 2 + .4, 0, Math.PI * 2); ctx.fill()
  }

  const date = new Date()
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = font(500, 34); ctx.textAlign = 'left'
  ctx.fillText(ja ? `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日` : date.toDateString(), 90, 140)
  ctx.fillStyle = '#fff'; ctx.font = font(700, 52)
  ctx.fillText(ja ? `${p.displayName.slice(0, 14)}の今日の勉強` : `${p.displayName.slice(0, 14)}'s study today`, 90, 214)

  // メインの勉強時間
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = font(500, 36)
  ctx.fillText(ja ? '勉強時間' : 'Focused for', 90, 360)
  const grad = ctx.createLinearGradient(90, 0, 900, 0)
  grad.addColorStop(0, '#9fb3ff'); grad.addColorStop(1, '#d6b8ff')
  ctx.fillStyle = grad; ctx.font = `700 150px "Inter", "Zen Kaku Gothic New", sans-serif`
  ctx.fillText(fmtHM(p.todaySeconds, ja), 84, 520)

  // サブ指標
  const tiles = [
    { v: `${p.streak}`, l: ja ? '日連続 🔥' : 'day streak 🔥' },
    { v: `${p.pomosToday}`, l: ja ? 'ポモドーロ 🍅' : 'pomodoros 🍅' },
  ]
  tiles.forEach((t, i) => {
    const x = 90 + i * 460, y = 590
    roundRect(ctx, x, y, 430, 190, 32)
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.font = `700 84px "Inter", sans-serif`; ctx.fillText(t.v, x + 40, y + 108)
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = font(500, 32); ctx.fillText(t.l, x + 40, y + 158)
  })

  // 今週のグラフ
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = font(500, 32)
  ctx.fillText(ja ? '今週' : 'This week', 90, 870)
  const byDay: Record<number, number> = {}
  p.week.forEach(d => { byDay[d.day_of_week] = Number(d.total_seconds) })
  const max = Math.max(3600, ...Object.values(byDay))
  const labels = ja ? ['日', '月', '火', '水', '木', '金', '土'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  const today = date.getDay()
  for (let i = 0; i < 7; i++) {
    const v = byDay[i] ?? 0, bh = Math.max(8, (v / max) * 200)
    const x = 100 + i * 128, y = 1110 - bh
    roundRect(ctx, x, y, 72, bh, 14)
    ctx.fillStyle = i === today ? '#9fb3ff' : 'rgba(255,255,255,.18)'; ctx.fill()
    ctx.fillStyle = i === today ? '#fff' : 'rgba(255,255,255,.5)'; ctx.font = font(500, 28); ctx.textAlign = 'center'
    ctx.fillText(labels[i], x + 36, 1156)
    ctx.textAlign = 'left'
  }

  // フッター（ブランドと URL）
  ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(90, 1210, W - 180, 2)
  roundRect(ctx, 90, 1240, 64, 64, 16)
  const lg = ctx.createLinearGradient(90, 1240, 154, 1304)
  lg.addColorStop(0, '#7d95ff'); lg.addColorStop(1, '#b48cff'); ctx.fillStyle = lg; ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = font(700, 36); ctx.textAlign = 'center'; ctx.fillText('自', 122, 1285)
  ctx.textAlign = 'left'; ctx.font = font(700, 34); ctx.fillText(ja ? '自習室 JP' : 'Study With Me JP', 176, 1272)
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = font(400, 26)
  ctx.fillText(ja ? 'みんなで集中するオンライン自習室' : 'Online study room', 176, 1306)
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `500 28px "Inter", sans-serif`
  ctx.fillText(origin.replace(/^https?:\/\//, ''), W - 90, 1290)
  ctx.textAlign = 'left'
}

export default function ShareCard(p: Props) {
  const ja = p.lang === 'ja'
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (p.openSignal) { setOpen(true); track('sharecard_open', { trigger: 'auto' }) } }, [p.openSignal])
  // 共有する URL は自分の紹介リンク（取れなければサイトのトップ）
  const [shareUrl, setShareUrl] = useState('')
  useEffect(() => {
    if (!open) return
    setShareUrl(u => u || window.location.origin)
    fetch('/api/me/referral', { cache: 'no-store' }).then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.url) setShareUrl(d.url) }).catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open || !canvasRef.current) return
    let cancelled = false
    const run = async () => {
      try { await document.fonts?.ready } catch {}
      if (cancelled || !canvasRef.current) return
      draw(canvasRef.current, p, window.location.origin)
      setUrl(canvasRef.current.toDataURL('image/png'))
    }
    run()
    return () => { cancelled = true }
  }, [open, p.todaySeconds, p.pomosToday, p.streak, p.lang])

  const shareText = ja
    ? `今日は${fmtHM(p.todaySeconds, true)}勉強しました📚 ${p.streak}日連続🔥\n#勉強垢さんと繋がりたい #自習室JP\n${shareUrl}`
    : `Studied ${fmtHM(p.todaySeconds, false)} today 📚 ${p.streak}-day streak 🔥\n${shareUrl}`

  async function share() {
    if (!canvasRef.current) return
    const blob: Blob | null = await new Promise(r => canvasRef.current!.toBlob(r, 'image/png'))
    if (!blob) return
    const file = new File([blob], 'jishuuroom-today.png', { type: 'image/png' })
    track('sharecard_share')
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text: shareText }); return } catch { return }
    }
    download()
  }
  function download() {
    track('sharecard_save')
    if (!url) return
    const a = document.createElement('a'); a.href = url; a.download = 'jishuuroom-today.png'; a.click()
    p.onToast(ja ? '📥 画像を保存しました' : '📥 Image saved')
  }
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}`

  return (
    <>
      {!p.hideButton && (
        <button className={styles.openBtn} onClick={() => { setOpen(true); track('sharecard_open', { trigger: 'manual' }) }} disabled={p.todaySeconds < 60}
          title={p.todaySeconds < 60 ? (ja ? 'まず1ポモドーロやってみよう' : 'Finish a session first') : undefined}>
          📸 {p.todaySeconds < 60 ? (ja ? 'まず1ポモドーロやってみよう' : 'Finish a session to share') : (ja ? '今日の記録をシェア' : 'Share today\'s record')}
        </button>
      )}
      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} role="dialog" aria-label={ja ? '今日の記録カード' : 'Today\'s record card'}>
            <canvas ref={canvasRef} className={styles.canvas}/>
            <div className={styles.btns}>
              <button className={`${styles.btn} ${styles.primary}`} onClick={share}>{ja ? '画像をシェア' : 'Share image'}</button>
              <a className={styles.btn} href={xUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('sharecard_x')}>{ja ? 'X に投稿' : 'Post on X'}</a>
              <button className={styles.btn} onClick={download}>{ja ? '保存' : 'Save'}</button>
              <button className={`${styles.btn} ${styles.ghost}`} onClick={() => setOpen(false)}>{ja ? '閉じる' : 'Close'}</button>
            </div>
            <p className={styles.hint}>{ja ? '画像はこの端末の中だけで作られ、サーバーには送られません。' : 'The image is generated on your device only.'}</p>
          </div>
        </div>
      )}
    </>
  )
}
