'use client'
// components/room/TaskPanel.tsx
import { useState } from 'react'
import { useTaskSharing, type SharedTask, type StudyPair } from '@/hooks/useTaskSharing'
import type { Task } from '@/lib/supabase/types'
import styles from './TaskPanel.module.css'

type Props = {
  userId: string
  roomId: string
  tasks: Task[]
  onAddTask: (title: string) => Promise<void>
  onCompleteTask: (task: Task) => Promise<void>
  onDeleteTask: (taskId: string) => Promise<void>
  onUpdateShare?: (taskId: string, scope: 'private' | 'friends' | 'room') => Promise<void>
  friends: { id: string; display_name: string; avatar_url: string | null }[]
  lang?: 'ja' | 'en'
}

export default function TaskPanel({
  userId, roomId, tasks, onAddTask, onCompleteTask, onDeleteTask, onUpdateShare, friends, lang = 'ja'
}: Props) {
  const tr = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState<'mine' | 'shared'>('mine')
  const {
    sharedTasks,
    studyPairs,
    pendingPairRequests,
    updateTaskShare,
    requestPair,
    acceptPair,
    endPair,
  } = useTaskSharing(userId, roomId)

  async function handleAdd() {
    if (!input.trim()) return
    await onAddTask(input.trim())
    setInput('')
  }

  function ShareToggle({ task }: { task: Task & { share_scope?: string } }) {
    const scope = (task.share_scope || 'private') as 'private' | 'friends' | 'room'
    const options: { value: 'private' | 'friends' | 'room'; label: string; icon: string }[] = [
      { value: 'private', label: tr('🔒 非公開（自分のみ）', '🔒 Private (only me)'), icon: '🔒' },
      { value: 'friends', label: tr('👥 フレンドに公開', '👥 Visible to friends'), icon: '👥' },
      { value: 'room', label: tr('🏠 ルーム全員に公開', '🏠 Visible to this room'), icon: '🏠' },
    ]
    return (
      <div className={styles.shareToggle}>
        {options.map(opt => (
          <button
            key={opt.value}
            className={`${styles.shareBtn} ${scope === opt.value ? styles.shareBtnActive : ''}`}
            onClick={e => { e.stopPropagation(); onUpdateShare ? onUpdateShare(task.id, opt.value) : updateTaskShare(task.id, opt.value) }}
            title={opt.label}
          >
            {opt.icon}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {/* Study Pairs */}
      {(studyPairs.length > 0 || pendingPairRequests.length > 0) && (
        <div className={styles.pairsSection}>
          <div className={styles.secLabel}>🤝 {tr('一緒に勉強中', 'Studying together')}</div>

          {/* 承認待ちリクエスト */}
          {pendingPairRequests.map(req => (
            <div key={req.id} className={styles.pairRequest}>
              <div className={styles.pairAvatar}>
                {req.partner?.avatar_url
                  ? <img src={req.partner.avatar_url} width={28} height={28} style={{ borderRadius: '50%' }} alt="" />
                  : req.partner?.display_name[0]}
              </div>
              <div className={styles.pairInfo}>
                <div className={styles.pairName}>{req.partner?.display_name}</div>
                <div className={styles.pairMeta}>{tr('一緒に勉強しませんか？', 'Wants to study together')}</div>
              </div>
              <div className={styles.pairActions}>
                <button
                  className={`${styles.pairBtn} ${styles.pairBtnAccept}`}
                  onClick={() => req.partner && acceptPair(req.partner.id)}
                >✓ {tr('承認', 'Accept')}</button>
              </div>
            </div>
          ))}

          {/* アクティブなペア */}
          {studyPairs.map(pair => (
            <div key={pair.id} className={`${styles.pairRequest} ${styles.pairActive}`}>
              <div className={styles.pairActiveDot} />
              <div className={styles.pairAvatar}>
                {pair.partner?.avatar_url
                  ? <img src={pair.partner.avatar_url} width={28} height={28} style={{ borderRadius: '50%' }} alt="" />
                  : pair.partner?.display_name[0]}
              </div>
              <div className={styles.pairInfo}>
                <div className={styles.pairName}>{pair.partner?.display_name}</div>
                <div className={styles.pairMeta}>🟢 {tr('一緒に勉強中', 'Studying together')}</div>
              </div>
              <button
                className={`${styles.pairBtn} ${styles.pairBtnEnd}`}
                onClick={() => pair.partner && endPair(pair.partner.id)}
              >{tr('終了', 'End')}</button>
            </div>
          ))}
        </div>
      )}

      {/* Pair Request Buttons for Friends */}
      {friends.length > 0 && studyPairs.length === 0 && pendingPairRequests.length === 0 && (
        <div className={styles.pairSuggest}>
          <div className={styles.secLabel}>🤝 {tr('一緒に勉強しませんか？', 'Study together?')}</div>
          <div className={styles.pairSuggestList}>
            {friends.slice(0, 3).map(f => (
              <button
                key={f.id}
                className={styles.pairSuggestBtn}
                onClick={() => requestPair(f.id)}
              >
                {f.avatar_url
                  ? <img src={f.avatar_url} width={20} height={20} style={{ borderRadius: '50%' }} alt="" />
                  : <span>{f.display_name[0]}</span>}
                {tr(`${f.display_name} に申請`, `Ask ${f.display_name}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'mine' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('mine')}
        >
          {tr('自分のタスク', 'My tasks')} ({tasks.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'shared' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('shared')}
        >
          {tr('共有タスク', 'Shared')}
          {sharedTasks.length > 0 && (
            <span className={styles.badge}>{sharedTasks.length}</span>
          )}
        </button>
      </div>

      {activeTab === 'mine' && (
        <>
          {/* Add Task */}
          <div className={styles.inputRow}>
            <input
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder={tr('タスクを追加...', 'Add a task...')}
            />
            <button className={styles.addBtn} onClick={handleAdd}>+</button>
          </div>

          {/* My Tasks */}
          <div className={styles.taskList}>
            {tasks.length === 0 && (
              <div className={styles.empty}>{tr('タスクを追加して今日の目標を設定しよう！', "Add a task to set today's goal!")}</div>
            )}
            {tasks.map(task => {
              const t = task as Task & { share_scope?: string }
              return (
                <div key={task.id} className={styles.taskItem}>
                  <button
                    className={styles.checkBtn}
                    onClick={() => onCompleteTask(task)}
                    title={tr('完了にする', 'Mark done')}
                  >✓</button>
                  <span className={styles.taskTitle}>{task.title}</span>
                  <ShareToggle task={t} />
                  <button
                    className={styles.delBtn}
                    onClick={() => onDeleteTask(task.id)}
                  >✕</button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {activeTab === 'shared' && (
        <div className={styles.taskList}>
          {sharedTasks.length === 0 && (
            <div className={styles.empty}>
              {tr('フレンドや同室のユーザーが', 'Tasks shared by friends and')}<br />{tr('タスクを共有するとここに表示されます', 'people in this room appear here')}
            </div>
          )}
          {sharedTasks.map(task => (
            <div key={task.id} className={`${styles.taskItem} ${styles.sharedTaskItem}`}>
              <div className={styles.sharedAvatar}>
                {task.avatar_url
                  ? <img src={task.avatar_url} width={20} height={20} style={{ borderRadius: '50%' }} alt="" />
                  : task.display_name[0]}
              </div>
              <div className={styles.sharedContent}>
                <div className={styles.taskTitle}>{task.title}</div>
                <div className={styles.sharedBy}>
                  {task.display_name} ·
                  <span className={styles.scopeBadge}>
                    {task.share_scope === 'friends' ? tr('👥 フレンド', '👥 Friends') : tr('🏠 ルーム', '🏠 Room')}
                  </span>
                </div>
              </div>
              {task.completed && <span className={styles.completedBadge}>✅ {tr('完了！', 'Done!')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
