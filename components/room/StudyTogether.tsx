'use client'
// components/room/StudyTogether.tsx — 友達と勉強する：部屋づくり・招待リンク・フレンドの居場所
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Room } from '@/lib/supabase/types'
import styles from './StudyTogether.module.css'
import { track } from '@/lib/analytics'

type Lang = 'ja' | 'en'
type Where = Map<string, { roomId: string; studying: boolean }>

export type FriendStatus = {
  tone: 'here' | 'studying' | 'online' | 'offline'
  label: string
  /** 合流できる部屋（今いる部屋・入れない部屋なら null） */
  joinRoomId: string | null
  /** 入室権のないプライベートルームにいる */
  locked: boolean
}

/** フレンドが今どこで何をしているか */
export function describeFriend(friendId: string, whereIs: Where, roomsById: Map<string, Pick<Room, 'id' | 'name' | 'emoji'>>, currentRoomId: string, lang: Lang): FriendStatus {
  const w = whereIs.get(friendId)
  if (!w) return { tone: 'offline', label: lang === 'ja' ? 'オフライン' : 'Offline', joinRoomId: null, locked: false }
  const doing = w.studying ? (lang === 'ja' ? '集中中' : 'focusing') : (lang === 'ja' ? '休憩中' : 'on break')
  if (w.roomId === currentRoomId) return { tone: 'here', label: lang === 'ja' ? `同じ部屋で${doing}` : `Here · ${doing}`, joinRoomId: null, locked: false }
  const r = roomsById.get(w.roomId)
  if (!r) return { tone: w.studying ? 'studying' : 'online', label: lang === 'ja' ? `プライベートルームで${doing}` : `In a private room · ${doing}`, joinRoomId: null, locked: true }
  return { tone: w.studying ? 'studying' : 'online', label: `${r.emoji ?? ''} ${r.name}${lang === 'ja' ? `で${doing}` : ` · ${doing}`}`, joinRoomId: r.id, locked: false }
}

const INVITE_PATH_RE = /(?:^|\s)(\/(?:invite\/[A-Za-z0-9]{4,32}|room\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))\s*$/i

/** 招待メッセージなら { text, path } を返す */
export function parseInvite(content: string): { text: string; path: string } | null {
  const m = content.match(INVITE_PATH_RE)
  if (!m) return null
  return { text: content.slice(0, m.index).trim(), path: m[1] }
}

/** チャットの吹き出し。招待リンクなら「参加する」ボタンを出す */
export function ChatBubbleContent({ content, mine, lang }: { content: string; mine: boolean; lang: Lang }) {
  const router = useRouter()
  const inv = parseInvite(content)
  if (!inv) return <>{content}</>
  return (
    <div className={styles.inviteMsg}>
      <div>{inv.text || (lang === 'ja' ? '部屋への招待' : 'Room invite')}</div>
      {!mine && <button className={styles.inviteJoin} onClick={() => router.push(inv.path)}>{lang === 'ja' ? '参加する' : 'Join'}</button>}
    </div>
  )
}

type Props = {
  lang: Lang
  room: Room
  userId: string
  displayName: string
  myPrivateRooms: Room[]
  onToast: (msg: string) => void
}

/** フレンドパネルの上に出す「友達と勉強する」カード */
export default function StudyTogether({ lang, room, userId, displayName, myPrivateRooms, onToast }: Props) {
  const router = useRouter()
  const ja = lang === 'ja'
  const [origin, setOrigin] = useState('')
  const [rooms, setRooms] = useState(myPrivateRooms)
  const [canShare, setCanShare] = useState(false)

  useEffect(() => {
    setOrigin(window.location.origin)
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])
  useEffect(() => { setRooms(myPrivateRooms) }, [myPrivateRooms])

  // 作り直した招待コード（作り直すまでは部屋のコード）
  const [inviteCode, setInviteCode] = useState(room.invite_code)
  useEffect(() => { setInviteCode(room.invite_code) }, [room.id, room.invite_code])
  const isOwner = !!room.is_private && room.created_by === userId
  const [managing, setManaging] = useState(false)
  const [members, setMembers] = useState<{ id: string; display_name: string }[] | null>(null)

  async function loadMembers() {
    const res = await fetch(`/api/room/private?roomId=${room.id}`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    setMembers(res.ok ? data.members ?? [] : [])
  }
  async function reissue() {
    if (!window.confirm(ja ? '招待リンクを作り直しますか？今までのリンクは使えなくなります（すでに入れる人はそのまま入れます）。' : 'Create a new invite link? The old link will stop working.')) return
    const res = await fetch('/api/room/private', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: room.id, action: 'reissue' }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { onToast('❌ ' + (data.error ?? (ja ? '作り直せませんでした' : 'Failed'))); return }
    setInviteCode(data.invite_code)
    onToast(ja ? '🔗 新しい招待リンクを作りました。古いリンクは使えません' : '🔗 New invite link created')
  }
  async function revoke(id: string, name: string) {
    if (!window.confirm(ja ? `${name}さんをこの部屋に入れないようにしますか？（相手には通知されません）` : `Remove ${name}'s access?`)) return
    const res = await fetch('/api/room/private', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: room.id, action: 'revoke', targetId: id }) })
    if (!res.ok) { onToast(ja ? '❌ 取り消せませんでした' : '❌ Failed'); return }
    setMembers(m => (m ?? []).filter(x => x.id !== id))
    onToast(ja ? `${name}さんの入室権を取り消しました。リンクも作り直すと安心です` : `Removed ${name}`)
  }

  const inviteUrl = room.is_private && inviteCode
    ? `${origin}/invite/${inviteCode}`
    : `${origin}/room/${room.id}`
  // LINE のアプリ内ブラウザでは Google ログインが拒否されるので、LINE で送るリンクは外部ブラウザで開かせる
  const lineInviteUrl = inviteUrl + (inviteUrl.includes('?') ? '&' : '?') + 'openExternalBrowser=1'
  const shareText = ja
    ? `「${room.name}」で一緒に勉強しよう！📚\n${inviteUrl}`
    : `Let's study together in "${room.name}"! 📚\n${inviteUrl}`
  const lineText = ja
    ? `「${room.name}」で一緒に勉強しよう！📚\n${lineInviteUrl}`
    : `Let's study together in "${room.name}"! 📚\n${lineInviteUrl}`

  async function copyLink() {
    track('invite_link_copy')
    try { await navigator.clipboard.writeText(inviteUrl); onToast(ja ? '🔗 招待リンクをコピーしました' : '🔗 Invite link copied') }
    catch { window.prompt(ja ? 'このリンクをコピーしてください' : 'Copy this link', inviteUrl) }
  }
  async function nativeShare() {
    track('invite_link_native')
    try { await navigator.share({ title: room.name, text: shareText }) } catch { /* キャンセル */ }
  }
  const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(lineText)}`

  async function deleteRoom(r: Room) {
    if (!window.confirm(ja ? `「${r.name}」を削除しますか？招待リンクも使えなくなります。` : `Delete "${r.name}"? The invite link will stop working.`)) return
    const res = await fetch('/api/room/private', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ roomId: r.id }) })
    if (!res.ok) { onToast(ja ? '❌ 削除できませんでした' : '❌ Could not delete'); return }
    onToast(ja ? '🗑 部屋を削除しました' : '🗑 Room deleted')
    if (r.id === room.id) router.push('/lobby')
    else setRooms(rs => rs.filter(x => x.id !== r.id))
  }

  const otherRooms = rooms.filter(r => r.id !== room.id)

  return (
    <div className={styles.card}>
      <div className={styles.title}>🤝 {ja ? '友達と勉強する' : 'Study with friends'}</div>

      <div className={styles.sub}>
        {room.is_private
          ? (ja ? 'この部屋の招待リンク。開いた友達はそのまま入室できます' : 'Invite link for this room — friends can join right away')
          : (ja ? 'この部屋に友達を呼ぶ' : 'Invite friends to this room')}
      </div>
      <div className={styles.linkRow}>
        <input className={styles.linkInput} value={inviteUrl} readOnly onFocus={e => e.currentTarget.select()} aria-label={ja ? '招待リンク' : 'Invite link'}/>
        <button className={styles.btn} onClick={copyLink}>{ja ? 'コピー' : 'Copy'}</button>
      </div>
      <div className={styles.shareRow}>
        <a className={`${styles.btn} ${styles.line}`} href={lineUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('invite_link_line')}>LINE{ja ? 'で送る' : ''}</a>
        {canShare && <button className={styles.btn} onClick={nativeShare}>{ja ? 'その他の方法で共有' : 'Share…'}</button>}
      </div>

      {isOwner && (
        <div className={styles.manage}>
          <button className={`${styles.btn} ${styles.ghost} ${styles.wide}`} aria-expanded={managing}
            onClick={() => { const next = !managing; setManaging(next); if (next && members === null) loadMembers() }}>
            ⚙️ {ja ? '部屋の管理（入れる人・招待リンク）' : 'Manage room'}
          </button>
          {managing && (
            <div className={styles.manageBody}>
              <div className={styles.sub}>{ja ? 'この部屋に入れる人' : 'People with access'}</div>
              {members === null && <div className={styles.sub}>{ja ? '読み込み中…' : 'Loading…'}</div>}
              {members?.length === 0 && <div className={styles.sub}>{ja ? 'まだ誰も招待していません' : 'No one yet'}</div>}
              {members?.map(m => (
                <div key={m.id} className={styles.myRoom}>
                  <span className={styles.blockedName}>{m.display_name || (ja ? '（名前なし）' : '(no name)')}</span>
                  <button className={styles.mini} onClick={() => revoke(m.id, m.display_name)}>{ja ? '外す' : 'Remove'}</button>
                </div>
              ))}
              <div className={styles.shareRow}>
                <button className={styles.btn} onClick={reissue}>{ja ? '招待リンクを作り直す' : 'New invite link'}</button>
                <button className={`${styles.btn} ${styles.danger}`} onClick={() => deleteRoom(room)}>{ja ? 'この部屋を削除' : 'Delete room'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {!room.is_private && (
        <a className={`${styles.btn} ${styles.primary} ${styles.wide}`} href="/lobby#study-groups">
          📅 {ja ? '時間を決めて友達と勉強会（ロビー）' : 'Plan a study group (lobby)'}
        </a>
      )}

      {otherRooms.length > 0 && (
        <div className={styles.myRooms}>
          <div className={styles.sub}>{ja ? 'あなたのプライベートルーム' : 'Your private rooms'}</div>
          {otherRooms.map(r => (
            <div key={r.id} className={styles.myRoom}>
              <button className={styles.myRoomName} onClick={() => router.push(`/room/${r.id}`)}>{r.emoji} {r.name}</button>
              {r.created_by === userId && <button className={styles.iconBtn} onClick={() => deleteRoom(r)} aria-label={ja ? '削除' : 'Delete'}>🗑</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** フレンド一覧の1行に出す「居場所」と「合流／招待」ボタン */
export function FriendPresence({ status, lang, onJoin, onInvite, onAskInvite }: {
  status: FriendStatus
  lang: Lang
  onJoin: (roomId: string) => void
  onInvite: () => Promise<void> | void
  onAskInvite: () => Promise<void> | void
}) {
  const ja = lang === 'ja'
  const [sending, setSending] = useState<'invite' | 'ask' | null>(null)
  const [sent, setSent] = useState<'invite' | 'ask' | null>(null)
  async function run(kind: 'invite' | 'ask', fn: () => Promise<void> | void) {
    setSending(kind)
    try { await fn(); setSent(kind) } finally { setSending(null) }
  }
  return (
    <>
      <div className={`${styles.status} ${styles[status.tone]}`}>
        <span className={styles.dot}/>
        <span className={styles.statusText}>{status.label}</span>
      </div>
      <div className={styles.friendBtns} onClick={e => e.stopPropagation()}>
        {status.joinRoomId && (
          <button className={`${styles.mini} ${styles.miniJoin}`} onClick={() => onJoin(status.joinRoomId!)}>{ja ? '合流する' : 'Join'}</button>
        )}
        {status.locked && (
          <button className={styles.mini} disabled={!!sending || sent === 'ask'} onClick={() => run('ask', onAskInvite)}>
            {sent === 'ask' ? (ja ? 'お願いしました' : 'Asked') : (ja ? '入れてもらう' : 'Ask to join')}
          </button>
        )}
        {status.tone !== 'here' && (
          <button className={styles.mini} disabled={!!sending || sent === 'invite'} onClick={() => run('invite', onInvite)}>
            {sent === 'invite' ? (ja ? '招待しました' : 'Invited') : sending === 'invite' ? '…' : (ja ? 'この部屋に招待' : 'Invite here')}
          </button>
        )}
      </div>
    </>
  )
}

/** フレンドから招待が届いたときのお知らせ */
export function InviteBanner({ fromName, text, path, lang, onClose }: { fromName: string; text: string; path: string; lang: Lang; onClose: () => void }) {
  const router = useRouter()
  const ja = lang === 'ja'
  return (
    <div className={styles.banner} role="alert">
      <div className={styles.bannerText}><b>{fromName}</b>{ja ? 'さんから招待が届きました' : ' invited you'}{text ? `\n${text}` : ''}</div>
      <div className={styles.bannerBtns}>
        <button className={`${styles.btn} ${styles.ghost}`} onClick={onClose}>{ja ? 'あとで' : 'Later'}</button>
        <button className={`${styles.btn} ${styles.primary}`} onClick={() => { onClose(); router.push(path) }}>{ja ? '参加する' : 'Join'}</button>
      </div>
    </div>
  )
}

/** ブロック中のユーザー一覧（解除できる） */
export function BlockedList({ lang, blocked, onUnblock }: {
  lang: Lang
  blocked: { id: string; display_name: string; avatar_url: string | null }[]
  onUnblock: (id: string, name: string) => void
}) {
  const ja = lang === 'ja'
  if (blocked.length === 0) return null
  return (
    <details className={styles.blocked}>
      <summary>🚫 {ja ? `ブロック中のユーザー（${blocked.length}）` : `Blocked users (${blocked.length})`}</summary>
      {blocked.map(b => (
        <div key={b.id} className={styles.myRoom}>
          <span className={styles.blockedName}>{b.display_name || (ja ? '（不明なユーザー）' : '(unknown)')}</span>
          <button className={styles.mini} onClick={() => {
            if (window.confirm(ja ? `${b.display_name}さんのブロックを解除しますか？` : `Unblock ${b.display_name}?`)) onUnblock(b.id, b.display_name)
          }}>{ja ? '解除' : 'Unblock'}</button>
        </div>
      ))}
    </details>
  )
}
