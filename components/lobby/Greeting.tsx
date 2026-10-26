'use client'
// 見ている人の時刻に合わせた、静かな挨拶
import { useEffect, useState } from 'react'
import styles from './Lobby.module.css'

function greeting(name: string, h: number) {
  if (h >= 22 || h < 4) return { eyebrow: '静かな夜ですね', title: `${name}さん、ゆっくり、自分のペースで`, line: '灯りをつけて、少しだけ集中しましょう。' }
  if (h < 10) return { eyebrow: 'おはようございます', title: `${name}さん、今日も一緒に集中しましょう`, line: '朝の静けさは、いちばん頭が冴える時間です。' }
  if (h < 18) return { eyebrow: 'こんにちは', title: `${name}さん、今日も一緒に集中しましょう`, line: 'ひと区切りずつ、着実に。' }
  return { eyebrow: 'こんばんは', title: `${name}さん、今日もおつかれさまです`, line: '夜の時間を、自分のために。' }
}

export default function Greeting({ name }: { name: string }) {
  const [hour, setHour] = useState<number | null>(null)
  useEffect(() => setHour(new Date().getHours()), [])
  const g = greeting(name, hour ?? 12)
  return (
    <div style={{ opacity: hour === null ? 0 : 1, transition: 'opacity .6s ease' }}>
      <div className={styles.eyebrow}>{g.eyebrow}</div>
      <h1 className={styles.title}>{g.title}</h1>
      <p className={styles.lampLine}>{g.line}</p>
    </div>
  )
}
