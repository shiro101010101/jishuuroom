// lib/exams.ts — 目標の試験（profiles.goal_exam）の一覧。クライアント・サーバー・SQL の制約で共通
// ※ ここを変えたら supabase/migration_exam.sql の check 制約も合わせて変えること

export const EXAMS = [
  { slug: 'kyotsu', label: '共通テスト', emoji: '📝' },
  { slug: 'juken', label: '大学受験・一般', emoji: '🎓' },
  { slug: 'koko', label: '高校受験', emoji: '🏫' },
  { slug: 'teiki', label: '定期テスト', emoji: '📚' },
  { slug: 'eiken', label: '英検', emoji: '🔤' },
  { slug: 'toeic', label: 'TOEIC', emoji: '🌏' },
  { slug: 'boki', label: '簿記', emoji: '🧮' },
  { slug: 'takken', label: '宅建', emoji: '🏠' },
  { slug: 'fp', label: 'FP', emoji: '💴' },
  { slug: 'it', label: '基本情報・IT系', emoji: '💻' },
  { slug: 'komuin', label: '公務員試験', emoji: '🏛️' },
  { slug: 'other', label: 'その他', emoji: '✨' },
] as const

export type ExamSlug = (typeof EXAMS)[number]['slug']

const SLUGS = new Set<string>(EXAMS.map(e => e.slug))

export function isExamSlug(v: unknown): v is ExamSlug {
  return typeof v === 'string' && SLUGS.has(v)
}

export function examLabel(slug: string | null | undefined): string | null {
  return EXAMS.find(e => e.slug === slug)?.label ?? null
}
