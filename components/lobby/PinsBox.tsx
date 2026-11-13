'use client'
// components/lobby/PinsBox.tsx — ロビーの「ピン」：あなたをピンした人・ひみつのピンの数・マッチした勉強仲間
import { useCallback, useEffect, useState } from 'react'
import { examLabel } from '@/lib/exams'
import styles from './PinsBox.module.css'

type P = { id: string; name: string; avatar: string | null; goal: string | null; reason: string | null; secret: boolean; mutual: boolean; at: string }
type Data = { plan: 'free' | 'premium'; secretLimit: number; myPins: P[]; pinnedMe: P[]; secretCount: number; matches: string[] }

function Avatar({ p }: { p: { name: string; avatar: string | null } }) {
  return <span className={styles.avatar}>{p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer"/> : (p.name || '?').slice(0, 1)}</span>
}

export default function PinsBox({ demoData }: { demoData?: unknown } = {}) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (demoData) { setData(demoData as Data); return } // デモ画面：見本データ
    try {
      const res = await fetch('/api/pins', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? '読み込めませんでした')
      setData(d); setErr(null)
    } catch (e) { setErr((e as Error).message) }
  }, [demoData])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (data && window.location.hash === '#pins') document.getElementById('pins')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [data])

  async function pinBack(p: P) {
    setBusy(p.id)
    try {
      const res = await fetch('/api/pins', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetId: p.id }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg('❌ ' + (d.error ?? 'ピンできませんでした')); return }
      setMsg(d.mutual ? `🤝 ${p.name}さんとマッチしました！フレンドになりました` : `📌 ${p.name}さんをピンしました`)
      await load()
    } finally { setBusy(null) }
  }

  if (err) return null // DB 更新前などは出さない
  const matches = (data?.myPins ?? []).filter(p => p.mutual)
  const waiting = (data?.pinnedMe ?? []).filter(p => !p.mutual)

  return (
    <section id="pins" className={styles.box}>
      <h2 className={styles.h2}>ピンと勉強仲間</h2>
      {!data ? <div className={styles.empty}>読み込み中…</div> : (
        <>
          {data.secretCount > 0 && (
            <div className={styles.secret}>
              <span className={styles.secretIcon}>🤫</span>
              <span>
                <b>ひみつのピンが {data.secretCount} 件届いています</b>
                <small>誰からかは、あなたもその人をピンしたときにわかります。気になる人をピンしてみよう。</small>
              </span>
            </div>
          )}

          {waiting.length > 0 && (
            <div className={styles.group}>
              <div className={styles.label}>あなたをピンした人</div>
              {waiting.slice(0, 8).map(p => (
                <div key={p.id} className={styles.row}>
                  <Avatar p={p}/>
                  <span className={styles.body}>
                    <span className={styles.name}>{p.name}{p.goal && examLabel(p.goal) && <span className={styles.goal}>🎯 {examLabel(p.goal)}</span>}</span>
                    {p.reason && <span className={styles.reason}>「{p.reason}」</span>}
                  </span>
                  <button type="button" className={styles.back} disabled={busy === p.id} onClick={() => pinBack(p)}>ピンを返す</button>
                </div>
              ))}
            </div>
          )}

          {matches.length > 0 && (
            <div className={styles.group}>
              <div className={styles.label}>🤝 マッチした勉強仲間</div>
              {matches.slice(0, 12).map(p => (
                <div key={p.id} className={styles.row}>
                  <Avatar p={p}/>
                  <span className={styles.body}>
                    <span className={styles.name}>{p.name}{p.goal && examLabel(p.goal) && <span className={styles.goal}>🎯 {examLabel(p.goal)}</span>}</span>
                    <span className={styles.reason}>フレンドになりました。部屋のフレンド欄からメッセージできます</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {data.secretCount === 0 && waiting.length === 0 && matches.length === 0 && (
            <div className={styles.empty}>
              部屋で気になる勉強仲間を 📌 ピンしてみよう。<br/>お互いにピンするとマッチして、フレンドになれます。<br/>ひみつのピンなら、相手には知られません。
            </div>
          )}
          <div className={styles.foot}>
            ピン中 {data.myPins.length}人 · ひみつ {data.myPins.filter(p => p.secret).length}/{data.plan === 'premium' ? '無制限' : data.secretLimit}
            {data.plan === 'free' && <a href="/premium" className={styles.upgrade}>✦ ひみつのピンを無制限に</a>}
          </div>
          {msg && <div className={styles.msg} role="status">{msg}</div>}
        </>
      )}
    </section>
  )
}
