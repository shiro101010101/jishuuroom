#!/usr/bin/env node
// scripts/check-ui.mjs — 画面とセキュリティ設定の自動チェック
//
// 使い方:  npm run check:ui            （http://localhost:3000 が起動していなければ自動で起動）
//          BASE_URL=https://本番URL npm run check:ui   （公開中のサイトを確認）
//
// 調べること（ページ × 画面幅ごと）
//   - ページが正常に開けるか（HTTP ステータス）
//   - 横にはみ出していないか（横スクロールが出ないか・画面外に飛び出した要素がないか）
//   - ブラウザのエラー（JavaScript の例外・console.error）が出ていないか
//   - 画像が読み込めているか
//   - セキュリティ用のヘッダーが付いているか
//   - ログインしていない人が、守られたページ・API に入れないか
// スクリーンショットは checks/screenshots/ に保存する（人の目での確認用）

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const CHROME = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => existsSync(p))
const OUT = join(process.cwd(), 'checks', 'screenshots')
const PORT = 9300 + Math.floor(Math.random() * 500)

// 試験別ページの一覧（lib/exams.ts と同じ）
const EXAM_SLUGS = ['kyotsu', 'juken', 'koko', 'teiki', 'eiken', 'toeic', 'boki', 'takken', 'fp', 'it', 'komuin', 'other']
const VIEWPORTS = [
  { name: 'phone', width: 375, height: 812, mobile: true },   // iPhone SE〜13 mini 相当（狭め）
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'pc', width: 1440, height: 900, mobile: false },
  // 明るいテーマ（OS がライトモードの人）でも文字が読めるか
  { name: 'phone-light', width: 375, height: 812, mobile: true, scheme: 'light' },
  { name: 'pc-light', width: 1440, height: 900, mobile: false, scheme: 'light' },
]
// ログインなしで取れなければいけないもの（SNS のリンクプレビュー・検索エンジン）
const PUBLIC_ASSETS = ['/opengraph-image', '/robots.txt', '/sitemap.xml', '/manifest.json', ...EXAM_SLUGS.map(s => `/exam/${s}`)]
// ログインなしで見られるページ
const PAGES = ['/', '/terms', '/privacy', '/?next=/invite/ABCDEFGH', '/?error=banned', '/exam/kyotsu', '/exam/boki', '/exam/toeic', ...(process.env.EXTRA_PAGES ? process.env.EXTRA_PAGES.split(',') : [])]
// 試験別ページはすべてログインなしで開けること（見た目は代表 3 ページで確認）
// ログインしていない人を入れてはいけないところ
const PROTECTED = [
  { path: '/lobby', expect: 'redirect' },
  { path: '/room/00000000-0000-0000-0000-000000000001', expect: 'redirect' },
  { path: '/api/room/private', method: 'POST', expect: 401 },
  { path: '/api/room/invite', method: 'POST', expect: 401 },
  { path: '/api/profile', method: 'POST', expect: 401 },
  { path: '/api/supabase-token', expect: 401 },
  { path: '/api/leaderboard', expect: 401 },
  { path: '/api/turn', expect: 401 },
  { path: '/api/admin/ban', method: 'POST', expect: 401 },
  { path: '/api/push/subscribe', method: 'POST', expect: 401 },
  { path: '/api/push/subscribe', method: 'DELETE', expect: 401 },
  { path: '/api/me/referral', expect: 401 },
  { path: '/api/cron/reminders', expect: 401 },
]
const REQUIRED_HEADERS = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']

const sleep = ms => new Promise(r => setTimeout(r, ms))
const results = []
const fail = (area, msg) => results.push({ ok: false, area, msg })
const pass = (area, msg) => results.push({ ok: true, area, msg })

async function reachable() {
  try { await fetch(BASE, { redirect: 'manual' }); return true } catch { return false }
}

async function ensureServer() {
  if (await reachable()) return null
  if (!BASE.startsWith('http://localhost')) throw new Error(`${BASE} に接続できません`)
  console.log('… ローカルサーバーを起動しています')
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x',
    SUPABASE_SERVICE_ROLE_KEY: 'x', SUPABASE_JWT_SECRET: 'x', NEXTAUTH_SECRET: 'local-check-secret',
    AUTH_TRUST_HOST: 'true', ...process.env,
  }
  const port = new URL(BASE).port || '3000'
  const srv = spawn('npx', ['next', 'dev', '-p', port], { env, stdio: 'ignore', detached: true })
  for (let i = 0; i < 120; i++) { if (await reachable()) return srv; await sleep(1000) }
  throw new Error('サーバーが起動しませんでした')
}

// ── 1. ログインなしで入れてはいけないところ ──
async function checkProtected() {
  for (const p of PROTECTED) {
    const res = await fetch(BASE + p.path, { method: p.method || 'GET', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: p.method === 'POST' ? '{}' : undefined })
    const ok = p.expect === 'redirect' ? [302, 303, 307, 308].includes(res.status) : res.status === p.expect
    ;(ok ? pass : fail)('アクセス制限', `${p.method || 'GET'} ${p.path} → ${res.status}（期待: ${p.expect === 'redirect' ? 'ログイン画面へ転送' : p.expect}）`)
  }
}

// ── 1b. 公開されているべきもの ──
async function checkPublic() {
  for (const p of PUBLIC_ASSETS) {
    const res = await fetch(BASE + p, { redirect: 'manual' })
    ;(res.status === 200 ? pass : fail)('公開ファイル', `${p} → ${res.status}（期待: 200）`)
  }
}

// ── 2. セキュリティヘッダー ──
async function checkHeaders() {
  const res = await fetch(BASE + '/', { redirect: 'manual' })
  for (const h of REQUIRED_HEADERS) (res.headers.get(h) ? pass : fail)('セキュリティヘッダー', h)
  if (res.headers.get('x-powered-by')) fail('セキュリティヘッダー', 'x-powered-by が出ている（サーバーの種類が漏れる）')
}

// ── 3. 画面（Chrome を DevTools Protocol で操作） ──
async function checkScreens() {
  if (!CHROME) { fail('画面', 'Chrome が見つからないため画面チェックを省略（CHROME_PATH を指定してください）'); return }
  mkdirSync(OUT, { recursive: true })
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(tmpdir(), 'jishuu-check-' + PORT)}`, 'about:blank'], { stdio: 'ignore' })
  try {
    let targets
    for (let i = 0; i < 50 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json() } catch { await sleep(200) } }
    const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
    await new Promise(r => { ws.onopen = r })
    let id = 0
    const pending = new Map()
    const errors = []
    ws.onmessage = e => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id) }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text)
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '))
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) errors.push(`${m.params.entry.text} ${m.params.entry.url || ''}`)
    }
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable')
    const evaluate = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value

    for (const vp of VIEWPORTS) {
      await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile })
      await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile })
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: vp.scheme || 'dark' }] })
      // アプリは OS 設定ではなく、自分で保存したテーマ（localStorage の theme）で表示が決まるので、それを切り替える
      await send('Page.navigate', { url: BASE + '/terms' }); await sleep(1500)
      await evaluate(`localStorage.setItem('theme', '${vp.scheme || 'dark'}')`)
      for (const path of PAGES) {
        errors.length = 0
        const label = `${path} [${vp.name} ${vp.width}px]`
        await send('Page.navigate', { url: BASE + path })
        await sleep(3500)
        const info = await evaluate(`(async () => {
          await document.fonts?.ready
          const vw = document.documentElement.clientWidth
          const over = []
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
            if (r.width === 0 || cs.position === 'fixed' || cs.visibility === 'hidden') continue
            // 横スクロールする箱の中身は除外
            let p = el.parentElement, scrollable = false
            while (p) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { scrollable = true; break } p = p.parentElement }
            if (!scrollable && (r.right > vw + 1 || r.left < -1)) over.push((el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName) + ' (' + Math.round(r.left) + '〜' + Math.round(r.right) + 'px)')
          }
          const broken = [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src)
          // 小さすぎて押しにくいボタン（スマホ）
          const tiny = ${vp.mobile} ? [...document.querySelectorAll('a,button')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 32 || r.width < 32) }).map(b => (b.textContent || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 20)) : []
          // 文字と背景のコントラスト（WCAG）。グラデーション文字・画像の上の文字は背景色をたどれないので除外
          const lum = c => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(v => { v = v / 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return { L: .2126 * r + .7152 * g + .0722 * b, a: m[3] === undefined ? 1 : +m[3] } }
          const bgOf = el => { let e = el; while (e) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && e !== document.body && e !== document.documentElement) return null; const b = lum(cs.backgroundColor); if (b && b.a > .85) return b.L; e = e.parentElement } return lum(getComputedStyle(document.body).backgroundColor)?.L ?? null }
          const lowContrast = []
          for (const el of document.querySelectorAll('h1,h2,h3,p,a,button,label,li,summary,span')) {
            if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue
            const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue
            const cs = getComputedStyle(el); if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.color === 'rgba(0, 0, 0, 0)') continue
            const fg = lum(cs.color); const bg = bgOf(el); if (!fg || bg == null || fg.a < .5) continue
            const ratio = (Math.max(fg.L, bg) + .05) / (Math.min(fg.L, bg) + .05)
            const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700)
            if (ratio < (large ? 3 : 4.5)) lowContrast.push(el.textContent.trim().slice(0, 16) + ' (' + ratio.toFixed(1) + ')')
          }
          return { sw: document.documentElement.scrollWidth, vw, over: over.slice(0, 5), broken, tiny: tiny.slice(0, 8), low: [...new Set(lowContrast)].slice(0, 8), h: document.documentElement.scrollHeight, title: document.title }
        })()`)
        if (!info) { fail('画面', `${label}: ページを評価できませんでした`); continue }
        const theme = await evaluate('document.documentElement.dataset.theme')
        if (theme !== (vp.scheme || 'dark')) fail('テーマ', `${label}: ${vp.scheme || 'dark'} のつもりが ${theme} で表示された（チェックが正しく動いていない）`)
        ;(info.sw <= info.vw ? pass : fail)('はみ出し', `${label}: ページ幅 ${info.sw}px / 画面 ${info.vw}px`)
        if (info.over.length) fail('はみ出し', `${label}: 画面外に出ている要素 ${info.over.join(', ')}`)
        ;(info.broken.length ? fail : pass)('画像', `${label}: 読み込めない画像 ${info.broken.length}件 ${info.broken.join(' ')}`)
        ;(errors.length ? fail : pass)('エラー', `${label}: ${errors.length ? errors.slice(0, 3).join(' / ') : 'なし'}`)
        if (info.low.length) fail('読みやすさ', `${label}: 文字が背景に対して薄い ${info.low.join(' / ')}`)
        if (info.tiny.length) results.push({ ok: true, warn: true, area: '押しやすさ', msg: `${label}: 32px 未満のボタン ${info.tiny.join(' / ')}` })
        if (!info.title) fail('SEO', `${label}: タイトルがない`)
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: vp.width, height: Math.min(info.h, 8000), scale: 1 } })
        const file = `${vp.name}${path.replace(/[^a-z0-9]+/gi, '_')}.png`
        writeFileSync(join(OUT, file), Buffer.from(shot.data, 'base64'))
      }
    }
    ws.close()
  } finally { chrome.kill() }
}

const srv = await ensureServer()
try {
  console.log(`▶ チェック対象: ${BASE}\n`)
  await checkProtected()
  await checkPublic()
  await checkHeaders()
  await checkScreens()
} finally {
  if (srv) try { process.kill(-srv.pid) } catch {}
}

const bad = results.filter(r => !r.ok)
const warns = results.filter(r => r.warn)
for (const r of results) if (!r.ok || r.warn) console.log(`${r.ok ? '⚠️ ' : '❌'} [${r.area}] ${r.msg}`)
console.log(`\n合格 ${results.filter(r => r.ok && !r.warn).length} / 不合格 ${bad.length} / 注意 ${warns.length}`)
console.log(`スクリーンショット: ${OUT}`)
process.exit(bad.length ? 1 : 0)
