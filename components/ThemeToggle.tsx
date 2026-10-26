'use client'
// ライト / ダーク切り替え。選んだテーマは localStorage に保存し、初回は夜の雰囲気に合うダーク
import { useEffect, useState } from 'react'
import { Icon } from '@/components/room/Icons'

type Theme = 'light' | 'dark'
export const THEME_COLORS: Record<Theme, string> = { dark: '#04060b', light: '#eef1f7' }

/** 描画前に <head> で実行して、ちらつきなくテーマを当てるスクリプト */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.dataset.theme=t;var h=new Date().getHours();document.documentElement.dataset.time=h>=22||h<4?'night':h<7?'dawn':h<17?'day':'dusk';var c=t==='light'?'${THEME_COLORS.light}':'${THEME_COLORS.dark}';var f=function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})};f();document.addEventListener('DOMContentLoaded',f)}catch(e){document.documentElement.dataset.theme='dark'}})()`

export default function ThemeToggle({ className, size = 16 }: { className?: string; size?: number }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  }, [])

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', THEME_COLORS[next]))
    try { localStorage.setItem('theme', next) } catch {}
  }

  const label = theme === 'light' ? 'ダークモードにする' : 'ライトモードにする'
  return (
    <button type="button" className={className} onClick={toggle} title={label} aria-label={label}
      style={className ? undefined : {
        width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--fg),.05)', border: '1px solid rgba(var(--fg),.1)', color: 'var(--muted2)',
      }}>
      <Icon name={theme === 'light' ? 'moon' : 'sun'} size={size} />
    </button>
  )
}
