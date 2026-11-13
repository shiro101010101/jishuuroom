// hooks/useLibraryScene.ts — 自習室の背景（深夜の図書館）の選択。端末ごとに覚えておく
// 画像はすべて生成 AI で描いた架空の図書館（実在の建物の写真ではない）
'use client'
import { useSyncExternalStore } from 'react'

export type SceneId = 'window' | 'cedar' | 'baroque' | 'white' | 'none'
export const SCENES: { id: Exclude<SceneId, 'none'>; ja: string; en: string; rain?: boolean }[] = [
  { id: 'window',  ja: '雨の窓辺',       en: 'Rainy window', rain: true },
  { id: 'cedar',   ja: '木の傘の閲覧室', en: 'Timber dome' },
  { id: 'baroque', ja: '修道院の書庫',   en: 'Old abbey' },
  { id: 'white',   ja: '白い吹き抜け',   en: 'White atrium' },
]
const KEY = 'library-scene'
const DEFAULT: SceneId = 'window'
const listeners = new Set<() => void>()

function read(): SceneId {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'none' || SCENES.some(s => s.id === v)) return v as SceneId
  } catch {}
  return DEFAULT
}

export function setLibraryScene(id: SceneId) {
  try { localStorage.setItem(KEY, id) } catch {}
  listeners.forEach(l => l())
}

export function useLibraryScene(): SceneId {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    read,
    () => DEFAULT,
  )
}
