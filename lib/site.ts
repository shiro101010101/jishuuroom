// lib/site.ts — サイト全体の設定（運営者情報はリリース前に必ず書き換える）
export const SITE = {
  name: '自習室 JP',
  nameEn: 'Study With Me JP',
  tagline: '友達と、全国の仲間と。みんなで集中するオンライン自習室',
  description: 'カメラをONにして、全国の仲間や友達と一緒に勉強できる無料のオンライン自習室。ポモドーロタイマー、勉強時間ランキング、連続記録、友達だけの部屋、記録カードのシェアまで。受験・資格・定期テスト勉強に。',
  url: (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  /** 運営者名（個人なら屋号や氏名） */
  operator: process.env.NEXT_PUBLIC_OPERATOR_NAME || '自習室 JP 運営事務局',
  /** 問い合わせ先（メールアドレスまたはフォームの URL） */
  contact: process.env.NEXT_PUBLIC_CONTACT || '',
  updatedAt: '2026年11月26日',
}
