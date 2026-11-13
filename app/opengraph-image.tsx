// app/opengraph-image.tsx — SNS でリンクを共有したときに表示される画像
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '自習室 JP — みんなで集中するオンライン自習室'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const TITLE = '自習室 JP'
const LINE1 = '友達と、全国の仲間と。'
const LINE2 = 'みんなで集中するオンライン自習室'
const CHIPS = ['カメラで一緒に勉強', 'ポモドーロ', 'ランキング', '友達だけの部屋']

// 日本語フォント（使う文字だけ）を Google Fonts から取得。失敗したら標準フォントで描く
async function loadFont(text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@700&text=${encodeURIComponent(text)}`)).text()
    const url = css.match(/src: url\((.+?)\) format/)?.[1]
    if (!url) return null
    return await (await fetch(url)).arrayBuffer()
  } catch { return null }
}

export default async function OgImage() {
  const font = await loadFont(TITLE + LINE1 + LINE2 + CHIPS.join('') + '自')
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 90px',
        background: 'linear-gradient(135deg, #0b1026 0%, #141a3a 55%, #241b3f 100%)', color: '#fff', fontFamily: 'ZenKaku' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56,
            background: 'linear-gradient(135deg, #7d95ff, #b48cff)' }}>自</div>
          <div style={{ fontSize: 76, fontWeight: 700 }}>{TITLE}</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 52, fontWeight: 700, color: '#c9d3ff' }}>{LINE1}</div>
        <div style={{ fontSize: 52, fontWeight: 700 }}>{LINE2}</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 44 }}>
          {CHIPS.map(c => (
            <div key={c} style={{ fontSize: 26, padding: '10px 22px', borderRadius: 999, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)' }}>{c}</div>
          ))}
        </div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: 'ZenKaku', data: font, weight: 700, style: 'normal' }] : [] },
  )
}
