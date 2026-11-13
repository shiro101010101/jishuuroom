// lib/legal.ts — 特定商取引法に基づく表記の中身（サーバー専用。環境変数から読む）
// 個人で運営する場合、住所・電話番号は「請求があれば遅滞なく開示」とすることもできる（消費者庁のガイドラインを確認）
// 販売事業者名（LEGAL_SELLER_NAME）が未設定のあいだは、決済ボタンを出さない
export function legalInfo() {
  const v = (k: string) => (process.env[k] ?? '').trim()
  return {
    seller: v('LEGAL_SELLER_NAME'),
    manager: v('LEGAL_MANAGER_NAME'),
    address: v('LEGAL_ADDRESS') || '請求があった場合、遅滞なく開示します',
    phone: v('LEGAL_PHONE') || '請求があった場合、遅滞なく開示します',
    email: v('LEGAL_EMAIL'),
  }
}

export function legalReady() {
  const l = legalInfo()
  return !!(l.seller && l.email)
}
