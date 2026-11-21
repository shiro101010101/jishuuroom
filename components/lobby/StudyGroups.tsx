'use client'
// components/lobby/StudyGroups.tsx — ロビーの「友達との勉強会」
// 1 回だけ・毎週（曜日を選ぶ）の勉強会を作り、フレンドを招待する。招待された人は参加／辞退を選べる
// 開始 10〜15 分前に参加者へプッシュ通知（/api/cron/sessions）。データは /api/study-group
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PushOptIn from '@/components/push/PushOptIn'
import {
  ENTER_EARLY_MIN, JST_MS, MAX_TITLE, WEEKDAYS, formatJst, formatJstTime, formatRepeat,
} from '@/lib/studyGroups'
import styles from './StudyGroups.module.css'

type Person = { id: string; name: string; avatar: string | null }
type Status = 'host' | 'going' | 'invited' | 'declined' | 'open'
type Session = {
  id: string; title: string; startAt: number; durationMins: number; repeatDays: number[]
  host: Person; members: Person[]; status: Status
  roomId: string | null; roomName: string | null; inviteCode: string | null
}
type Data = { sessions: Session[]; friends: Person[]; rooms: { id: string; name: string }[] }

const DURATIONS = [25, 50, 60, 90, 120, 180]
const pad = (n: number) => String(n).padStart(2, '0')

function defaultDateTime() {
  const j = new Date(Date.now() + JST_MS + 60 * 60_000) // 1 時間後の「ちょうど」
  return { date: `${j.getUTCFullYear()}-${pad(j.getUTCMonth() + 1)}-${pad(j.getUTCDate())}`, time: `${pad(j.getUTCHours())}:00` }
}

async function call(method: string, body?: unknown) {
  const res = await fetch('/api/study-group', {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'うまくいきませんでした。時間をおいてもう一度お試しください')
  return data
}

function Avatars({ people }: { people: Person[] }) {
  const shown = people.slice(0, 5)
  return (
    <span className={styles.avatars} title={people.map(p => p.name).join('、')}>
      {shown.map(p => (
        <span key={p.id} className={styles.avatar}>
          {p.avatar ? <img src={p.avatar} alt="" referrerPolicy="no-referrer"/> : (p.name || '?').slice(0, 1)}
        </span>
      ))}
      {people.length > shown.length && <span className={styles.more}>+{people.length - shown.length}</span>}
    </span>
  )
}

function FriendPicker({ friends, selected, onChange, exclude = [] }: {
  friends: Person[]; selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]
}) {
  const list = friends.filter(f => !exclude.includes(f.id))
  if (friends.length === 0) return <p className={styles.hint}>まだフレンドがいません。部屋のフレンド機能で友達を追加すると、ここから招待できます（招待リンクでも誘えます）。</p>
  if (list.length === 0) return <p className={styles.hint}>招待できるフレンドは全員参加しています。</p>
  return (
    <div className={styles.friends}>
      {list.map(f => {
        const on = selected.includes(f.id)
        return (
          <button type="button" key={f.id} className={`${styles.friend} ${on ? styles.friendOn : ''}`} aria-pressed={on}
            onClick={() => onChange(on ? selected.filter(x => x !== f.id) : [...selected, f.id])}>
            <span className={styles.avatar}>{f.avatar ? <img src={f.avatar} alt="" referrerPolicy="no-referrer"/> : (f.name || '?').slice(0, 1)}</span>
            {f.name}
          </button>
        )
      })}
    </div>
  )
}

export default function StudyGroups({ demoData }: { demoData?: unknown } = {}) {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [inviting, setInviting] = useState<string | null>(null)
  const [inviteSel, setInviteSel] = useState<string[]>([])
  const [showPush, setShowPush] = useState(false)

  // 作成フォーム
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [weekly, setWeekly] = useState(false)
  const [days, setDays] = useState<number[]>([])
  const [{ date, time }, setDT] = useState(defaultDateTime)
  const [duration, setDuration] = useState(60)
  const [roomId, setRoomId] = useState('')
  const [friendSel, setFriendSel] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (demoData) { setData(demoData as Data); return } // デモ画面：見本データ
    try { setData(await call('GET')); setLoadError(null) }
    catch (e) { setLoadError((e as Error).message) }
  }, [demoData])

  useEffect(() => { load() }, [load])
  // 回が終わったら読み直す（毎週の勉強会は次の回の日時に変わる）
  useEffect(() => {
    if (!data || demoData) return
    if (data.sessions.some(s => now >= s.startAt + s.durationMins * 60_000)) load()
  }, [now, data, demoData, load])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    const onFocus = () => { setNow(Date.now()); load() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])
  // 通知から開いたとき（/lobby#study-groups）はここまでスクロール
  useEffect(() => {
    if (data && window.location.hash === '#study-groups') document.getElementById('study-groups')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [data])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const invitedCount = useMemo(() => (data?.sessions ?? []).filter(s => s.status === 'invited').length, [data])

  async function act(s: Session, action: 'join' | 'decline' | 'leave') {
    setBusy(s.id + action)
    try {
      await call('PATCH', { sessionId: s.id, action })
      setToast(action === 'join' ? '✅ 参加します！始まる前に通知でお知らせします' : action === 'decline' ? '今回は見送りにしました' : '参加をやめました')
      if (action === 'join') setShowPush(true)
      await load()
    } catch (e) { setToast('❌ ' + (e as Error).message) }
    finally { setBusy(null) }
  }

  async function remove(s: Session) {
    if (!window.confirm(`勉強会「${s.title}」を削除しますか？${s.repeatDays.length ? '（これからの回もすべてなくなります）' : ''}`)) return
    setBusy(s.id + 'delete')
    try { await call('DELETE', { sessionId: s.id }); setToast('削除しました'); await load() }
    catch (e) { setToast('❌ ' + (e as Error).message) }
    finally { setBusy(null) }
  }

  async function sendInvites(s: Session) {
    if (inviteSel.length === 0) return
    setBusy(s.id + 'invite')
    try {
      const r = await call('PATCH', { sessionId: s.id, action: 'invite', friendIds: inviteSel })
      setToast(`📨 ${r.invited ?? inviteSel.length}人に招待を送りました`)
      setInviting(null); setInviteSel([])
      await load()
    } catch (e) { setToast('❌ ' + (e as Error).message) }
    finally { setBusy(null) }
  }

  async function copyLink(s: Session) {
    if (!s.inviteCode) return
    const url = `${window.location.origin}/invite/${s.inviteCode}`
    try { await navigator.clipboard.writeText(url); setToast('🔗 招待リンクをコピーしました。フレンド以外の友達にも送れます') }
    catch { window.prompt('このリンクをコピーしてください', url) }
  }

  async function create() {
    setFormError(null)
    if (!title.trim()) { setFormError('タイトルを入力してください'); return }
    if (weekly && days.length === 0) { setFormError('曜日を1つ以上選んでください'); return }
    setBusy('create')
    try {
      const r = await call('POST', {
        title: title.trim(), durationMins: duration, time,
        ...(weekly ? { repeatDays: days } : { date, repeatDays: [] }),
        roomId: roomId || undefined, friendIds: friendSel,
      })
      setToast(r.invited > 0 ? `📅 勉強会を作り、${r.invited}人に招待を送りました` : '📅 勉強会を作りました。友達を招待しましょう')
      setOpen(false); setTitle(''); setDays([]); setFriendSel([]); setRoomId(''); setWeekly(false); setDT(defaultDateTime())
      setShowPush(true)
      await load()
    } catch (e) { setFormError((e as Error).message) }
    finally { setBusy(null) }
  }

  const sessions = data?.sessions ?? []

  return (
    <section id="study-groups" className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.h2}>友達との勉強会{invitedCount > 0 && <span className={styles.badge}>招待 {invitedCount}</span>}</h2>
        {!open && <button type="button" className={styles.primary} onClick={() => setOpen(true)}>＋ 勉強会を作る</button>}
      </div>

      {open && (
        <div className={styles.form}>
          <label className={styles.label}>
            タイトル
            <input className={styles.input} value={title} maxLength={MAX_TITLE} autoFocus placeholder="例：英単語もくもく会"
              onChange={e => setTitle(e.target.value)}/>
          </label>

          <div className={styles.seg} role="radiogroup" aria-label="開催のしかた">
            <button type="button" role="radio" aria-checked={!weekly} className={!weekly ? styles.segOn : ''} onClick={() => setWeekly(false)}>1回だけ</button>
            <button type="button" role="radio" aria-checked={weekly} className={weekly ? styles.segOn : ''} onClick={() => setWeekly(true)}>毎週くり返す</button>
          </div>

          {weekly ? (
            <div className={styles.label}>
              曜日
              <div className={styles.days}>
                {WEEKDAYS.map((w, i) => {
                  const on = days.includes(i)
                  return <button type="button" key={w} aria-pressed={on} className={`${styles.day} ${on ? styles.dayOn : ''}`}
                    onClick={() => setDays(on ? days.filter(d => d !== i) : [...days, i].sort())}>{w}</button>
                })}
              </div>
              <div className={styles.quickDays}>
                <button type="button" onClick={() => setDays([1, 2, 3, 4, 5])}>平日</button>
                <button type="button" onClick={() => setDays([0, 6])}>土日</button>
                <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>毎日</button>
              </div>
            </div>
          ) : null}

          <div className={styles.row}>
            {!weekly && (
              <label className={styles.label}>
                日付
                <input type="date" className={styles.input} value={date} onChange={e => setDT({ date: e.target.value, time })}/>
              </label>
            )}
            <label className={styles.label}>
              開始時刻
              <input type="time" className={styles.input} value={time} step={300} onChange={e => setDT({ date, time: e.target.value })}/>
            </label>
            <label className={styles.label}>
              長さ
              <select className={styles.input} value={duration} onChange={e => setDuration(Number(e.target.value))}>
                {DURATIONS.map(d => <option key={d} value={d}>{d >= 60 && d % 60 === 0 ? `${d / 60}時間` : `${d}分`}</option>)}
              </select>
            </label>
          </div>

          <label className={styles.label}>
            集まる部屋
            <select className={styles.input} value={roomId || data?.rooms?.[0]?.id || ''} onChange={e => setRoomId(e.target.value)}>
              {(data?.rooms ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>

          <div className={styles.label}>
            招待するフレンド
            <FriendPicker friends={data?.friends ?? []} selected={friendSel} onChange={setFriendSel}/>
          </div>

          <p className={styles.hint}>🕘 日本時間 ・ 当日は選んだ部屋に集合 ・ 開始10〜15分前に通知</p>
          {formError && <p className={styles.error}>{formError}{formError.includes('プレミアム') && <> <a href="/premium" className={styles.upgradeLink}>✦ プレミアムを見る</a></>}</p>}
          <div className={styles.btns}>
            <button type="button" className={styles.ghost} onClick={() => { setOpen(false); setFormError(null) }}>キャンセル</button>
            <button type="button" className={styles.primary} disabled={busy === 'create'} onClick={create}>
              {busy === 'create' ? '作成中…' : friendSel.length > 0 ? `作成して${friendSel.length}人を招待` : '作成する'}
            </button>
          </div>
        </div>
      )}

      {showPush && (
        <PushOptIn className={styles.push} dismissKey="jr_push_optin_groups_dismissed_at"
          title="勉強会の前に通知を受け取る"
          description="勉強会が始まる少し前と、友達から招待が届いたときにお知らせします。"
          doneText="通知をオンにしました。始まる前にお知らせします！"/>
      )}

      {loadError && <div className={styles.empty}>{loadError}</div>}
      {!loadError && data && sessions.length === 0 && !open && (
        <div className={styles.empty}>
          まだ予定はありません。<br/>「毎週 月・水・金 20:00」のように時間を決めて、友達と一緒に勉強しよう。
        </div>
      )}
      {!data && !loadError && <div className={styles.empty}>読み込み中…</div>}

      <div className={styles.list}>
        {sessions.map(s => {
          const end = s.startAt + s.durationMins * 60_000
          const live = now >= s.startAt && now < end
          const canEnter = !!s.roomId && (s.status === 'host' || s.status === 'going') && now >= s.startAt - ENTER_EARLY_MIN * 60_000
          const repeat = formatRepeat(s.repeatDays)
          const people = s.members.some(m => m.id === s.host.id) ? s.members : [s.host, ...s.members]
          const mins = Math.round((s.startAt - now) / 60_000)
          return (
            <article key={s.id} className={`${styles.card} ${live ? styles.live : ''} ${s.status === 'invited' ? styles.invited : ''}`}>
              <div className={styles.cardTop}>
                <div className={styles.when}>
                  {live ? <span className={styles.liveTag}><i/>開催中</span>
                    : mins > 0 && mins <= 60 ? <span className={styles.soonTag}>あと{mins}分</span> : null}
                  <span className={styles.date}>{repeat ? `${repeat} ${formatJstTime(s.startAt)}` : formatJst(s.startAt)}</span>
                  <span className={styles.dur}>{s.durationMins >= 60 && s.durationMins % 60 === 0 ? `${s.durationMins / 60}時間` : `${s.durationMins}分`}</span>
                </div>
                {s.status === 'invited' && <span className={styles.statusInvited}>招待されています</span>}
                {s.status === 'going' && <span className={styles.statusGoing}>参加予定</span>}
                {s.status === 'host' && <span className={styles.statusHost}>主催</span>}
                {s.status === 'declined' && <span className={styles.statusMuted}>見送り</span>}
              </div>
              <div className={styles.title}>{s.title}</div>
              <div className={styles.meta}>
                {repeat && <span>次回 {formatJst(s.startAt)}</span>}
                {s.roomName && <span>{s.roomName}</span>}
                <span>主催 {s.host.name || '—'}</span>
              </div>
              <div className={styles.cardBottom}>
                <span className={styles.people}><Avatars people={people}/>{s.members.length}人参加</span>
                <div className={styles.actions}>
                  {(s.status === 'invited' || s.status === 'open' || s.status === 'declined') && (
                    <button type="button" className={styles.primary} disabled={!!busy} onClick={() => act(s, 'join')}>参加する</button>
                  )}
                  {s.status === 'invited' && (
                    <button type="button" className={styles.ghost} disabled={!!busy} onClick={() => act(s, 'decline')}>今回は見送る</button>
                  )}
                  {canEnter && (
                    <button type="button" className={styles.enter} onClick={() => router.push(`/room/${s.roomId}`)}>{live ? '入室する' : 'もう入室する'}</button>
                  )}
                  {(s.status === 'host' || s.status === 'going') && (
                    <>
                      <button type="button" className={styles.ghost} onClick={() => { setInviting(inviting === s.id ? null : s.id); setInviteSel([]) }}>友達を招待</button>
                      {s.inviteCode && <button type="button" className={styles.ghost} onClick={() => copyLink(s)}>🔗 リンクをコピー</button>}
                    </>
                  )}
                  {s.status === 'going' && <button type="button" className={styles.text} disabled={!!busy} onClick={() => act(s, 'leave')}>参加をやめる</button>}
                  {s.status === 'host' && <button type="button" className={styles.danger} disabled={!!busy} onClick={() => remove(s)}>削除</button>}
                </div>
              </div>
              {inviting === s.id && (
                <div className={styles.inviteBox}>
                  <FriendPicker friends={data?.friends ?? []} selected={inviteSel} onChange={setInviteSel} exclude={people.map(p => p.id)}/>
                  <div className={styles.btns}>
                    <button type="button" className={styles.ghost} onClick={() => setInviting(null)}>閉じる</button>
                    <button type="button" className={styles.primary} disabled={inviteSel.length === 0 || busy === s.id + 'invite'} onClick={() => sendInvites(s)}>
                      {inviteSel.length > 0 ? `${inviteSel.length}人に招待を送る` : '招待を送る'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {toast && <div className={styles.toast} role="status">{toast}</div>}
    </section>
  )
}
