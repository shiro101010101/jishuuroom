'use client'
// components/room/LibraryBackdrop.tsx — 深夜の図書館の背景。机のランプの揺らぎ・光の中を漂うほこり・窓の雨
// 画面の向きに合わせて横長／縦長の画像を出し分け、画面幅に合った大きさだけを読み込む
import { useEffect } from 'react'
import { SCENES, useLibraryScene } from '@/hooks/useLibraryScene'
import styles from './LibraryBackdrop.module.css'

// ほこりの粒（毎回同じ配置にして、描画のたびに位置が変わらないようにする）
const MOTES = Array.from({ length: 18 }, (_, i) => {
  // サーバーとブラウザで小数の誤差が出ないよう、整数の計算だけで作る
  const r = (n: number) => ((i + 1) * 7919 * (n + 3) * 104729 % 1000) / 1000
  return { left: `${Math.round(8 + r(1) * 84)}%`, top: `${Math.round(30 + r(2) * 60)}%`, size: Math.round(15 + r(3) * 25) / 10,
    dur: Math.round(14 + r(4) * 16), delay: -Math.round(r(5) * 30), drift: Math.round((r(6) - .5) * 60) }
})

export default function LibraryBackdrop() {
  const scene = useLibraryScene()
  // 図書館の背景を出している間は、全体の星空の飾りを消す
  useEffect(() => {
    const el = document.documentElement
    if (scene === 'none') delete el.dataset.library; else el.dataset.library = scene
    return () => { delete el.dataset.library }
  }, [scene])
  if (scene === 'none') return null
  const meta = SCENES.find(s => s.id === scene)!
  const src = (k: string) => `/library/${scene}-${k}.webp`
  return (
    <div className={styles.root} aria-hidden="true" data-scene={scene}>
      <picture>
        <source media="(orientation: portrait)" srcSet={`${src('tall-720')} 720w, ${src('tall-1080')} 1080w`} sizes="100vw"/>
        <img key={scene} className={styles.img} src={src('wide-1600')} srcSet={`${src('wide-1600')} 1600w, ${src('wide-2560')} 2560w`}
          sizes="100vw" alt="" decoding="async" fetchPriority="low"/>
      </picture>
      <div className={styles.lamp}/>
      {meta.rain && <div className={styles.rain}/>}
      <div className={styles.motes}>
        {MOTES.map((m, i) => (
          <span key={i} style={{ left: m.left, top: m.top, width: m.size, height: m.size, animationDuration: `${m.dur}s`, animationDelay: `${m.delay}s`, '--dx': `${m.drift}px` } as React.CSSProperties}/>
        ))}
      </div>
      <div className={styles.scrim}/>
    </div>
  )
}
