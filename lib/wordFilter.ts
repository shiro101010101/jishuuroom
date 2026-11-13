// lib/wordFilter.ts — チャット・プロフィールで使う NG ワード（クライアントとサーバーの両方で使う）
export const WORD_FILTERS = [
  '死ね', 'バカ', 'アホ', 'きもい', 'うざい', '消えろ', 'クソ', 'ばか', 'あほ', 'ゴミ', 'カス',
  'えっち', 'エッチ', 'セックス', 'チンコ', 'マンコ', 'おっぱい', 'ちんちん', 'おちんちん',
  'ヌード', '裸', 'えろ', 'エロ', '18禁', 'アダルト',
  'キモい', 'デブ', 'ブス', 'キショい',
]

export const hasNgWord = (text: string) => WORD_FILTERS.some(w => text.includes(w))
