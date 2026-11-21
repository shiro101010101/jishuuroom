# 📚 自習室 JP — 完全セットアップガイド

---

## 🚀 起動まで（全ステップ）

### STEP 1 — 依存パッケージをインストール

```bash
cd jishuuroom
npm install
```

---

### STEP 2 — Supabase プロジェクト作成

1. https://supabase.com にアクセスしてアカウント作成
2. 「New Project」でプロジェクトを作成（リージョン: Northeast Asia 推奨）
3. 左メニュー **SQL Editor** を開く
4. `supabase/schema.sql` の内容を全コピペして **Run** 実行
5. 続けて `supabase/migration_task_sharing.sql` も同様に実行
6. 続けて以下を **この順番で** 実行
   1. `supabase/migration_missing_objects.sql`（今日の一言・リアクション・ピン・予約など）
   2. `supabase/migration_ranking.sql`（勉強時間ランキング）
   3. `supabase/migration_security.sql`（RLS の強化。**必ず STEP 3 の JWT Secret を設定・デプロイしてから実行**）
   4. `supabase/migration_profile.sql`（自己紹介とプロフィール画像。画像の保存先 `avatars` バケットも作られます）
   5. `supabase/migration_friend_rooms.sql`（友達だけの部屋。招待リンクを開いた人・招待されたフレンドが入れるようになります）
   6. `migration_hardening.sql` → `migration_friendship_guard.sql` → `migration_blocks.sql` → `migration_room_security.sql` → `migration_privacy.sql` → `migration_least_privilege.sql`（セキュリティ強化）
   7. Supabase ダッシュボードの **Realtime → Settings** で「Allow public access」を OFF にする（オンライン表示を非公開チャンネルだけにする）

---

### STEP 3 — Supabase のキーを取得

1. 左メニュー **Settings → API** を開く
2. 以下をメモする：
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon / public** → `eyJhbG...`
   - **service_role** → `eyJhbG...`（⚠️ 絶対に公開しない）
3. **Settings → JWT Keys**（または Settings → API → JWT Settings）の **JWT Secret**（Legacy JWT secret）もメモ
   - ブラウザから Supabase に「本人として」接続するために使います（⚠️ 絶対に公開しない）

---

### STEP 4 — Google OAuth 設定

1. https://console.cloud.google.com/ にアクセス
2. 「新しいプロジェクト」作成
3. 「APIとサービス → 認証情報 → OAuthクライアントID」作成
   - アプリケーション種類: **ウェブアプリケーション**
   - 承認済みリダイレクトURI:
     ```
     http://localhost:3000/api/auth/callback/google
     ```
4. **クライアントID** と **クライアントシークレット** をメモ

---

### STEP 5 — LINE Login 設定

1. https://developers.line.biz/ にアクセス
2. プロバイダー作成 → **LINE Loginチャネル** 作成
3. 「LINEログイン設定 → コールバックURL」に追加:
   ```
   http://localhost:3000/api/auth/callback/line
   ```
4. **チャネルID** と **チャネルシークレット** をメモ

---

### STEP 6 — .env.local を設定

```bash
cp .env.local.example .env.local
```

`.env.local` を開いて以下を入力:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co    ← STEP3のURL
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...              ← STEP3のanon key
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...                  ← STEP3のservice_role key
SUPABASE_JWT_SECRET=xxxxxxxx...                      ← STEP3のJWT Secret

NEXTAUTH_SECRET=ランダムな文字列                       ← 下記コマンドで生成
NEXTAUTH_URL=http://localhost:3000

GOOGLE_CLIENT_ID=123...apps.googleusercontent.com    ← STEP4
GOOGLE_CLIENT_SECRET=GOCSPX-xxx                      ← STEP4

LINE_CLIENT_ID=1234567890                             ← STEP5
LINE_CLIENT_SECRET=abcdef...                          ← STEP5

NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**NEXTAUTH_SECRET の生成方法:**
```bash
openssl rand -base64 32
```

---

### STEP 7 — 起動！

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く 🎉

---

## 🚢 Vercel デプロイ（本番公開）

### 1. GitHubにプッシュ

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/jishuuroom.git
git push -u origin main
```

### 2. Vercelに接続

1. https://vercel.com にアクセス
2. 「New Project」→ GitHubリポジトリを選択
3. 「Environment Variables」に `.env.local` の内容を全て入力
   - `NEXTAUTH_URL` は本番URLに変更: `https://your-app.vercel.app`
   - `NEXT_PUBLIC_APP_URL` も同様に変更

### 3. OAuth リダイレクトURIを本番URLに追加

**Google Cloud Console:**
```
https://your-app.vercel.app/api/auth/callback/google
```

**LINE Developers:**
```
https://your-app.vercel.app/api/auth/callback/line
```

### 4. Deploy！

Vercelが自動でビルド・デプロイします。

---

## 🛡️ 管理者設定（BAN機能）

自分を管理者にする（Supabase SQL Editor で実行）:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = 'あなたのユーザーUUID';
```

ユーザーIDの確認方法:
```sql
SELECT id, display_name FROM public.profiles;
```

---

## 📁 ファイル構成

```
jishuuroom/
├── auth.ts                      # NextAuth設定（Google・LINE）
├── middleware.ts                # 認証ミドルウェア・BANチェック
├── app/
│   ├── layout.tsx               # ルートレイアウト
│   ├── page.tsx                 # ログインページ
│   ├── banned/page.tsx          # BANページ
│   ├── room/[roomId]/page.tsx   # 自習ルーム
│   └── api/
│       ├── auth/[...nextauth]/  # NextAuth handler
│       └── admin/ban/           # BAN API
├── components/
│   ├── auth/LoginClient.tsx     # ログインUI
│   └── room/
│       ├── RoomClient.tsx       # メインUI（全機能統合）
│       └── TaskPanel.tsx        # タスク共有・ペア機能
├── hooks/
│   ├── useWebRTC.ts             # カメラ共有（P2P）
│   ├── useRealtime.ts           # Supabaseリアルタイム
│   ├── useTimer.ts              # ポモドーロタイマー
│   └── useTaskSharing.ts        # タスク共有・スタディペア
├── lib/supabase/
│   ├── client.ts                # ブラウザ用
│   ├── server.ts                # サーバー用
│   └── types.ts                 # 型定義
└── supabase/
    ├── schema.sql               # メインDB（最初に実行）
    └── migration_task_sharing.sql # タスク共有追加
```

---

## 🧪 ローカルで複数人テストする

Docker が必要です。本番のデータには触れません。

```bash
npx supabase init && npx supabase start      # ローカルの Supabase を起動
# 表示された API URL / anon key / service_role key / JWT secret を .env.local に設定し、
# supabase/ の SQL を README の順番で流す（psql postgresql://postgres:postgres@127.0.0.1:54322/postgres）
npm run dev
```

---

## ✅ リリース前・変更後のチェック（必ず実行）

```bash
npm run check          # 型チェック + 画面チェック（スマホ/タブレット/PC × 主要ページ）
BASE_URL=https://本番のURL npm run check:ui   # 公開中のサイトをチェック
```

- 画面チェックは「はみ出し・エラー・画像切れ・押しにくいボタン・セキュリティヘッダー・ログインなしで入れてはいけないページ」を自動で調べ、`checks/screenshots/` に全画面を保存します。不合格が1件でもあれば失敗になります。
- データベースのセキュリティは次の 2 本を SQL Editor で実行します。**両方合格するまでリリースしない**こと。
  1. `supabase/tests/security_audit.sql`（総点検）… 全テーブル・全ポリシー・全関数を機械的に調べます。「✅ 問題なし」の 1 行だけなら合格。
  2. `supabase/tests/security_test.sql`（攻撃テスト）… 3 人のテストユーザーで実際に攻撃を試します。`FAIL` が 1 行もなければ合格（テスト用データは最後に自動で削除）。
- テーブル・関数・ポリシーを追加したら、必ず総点検を実行してください。
- DB の SQL は `migration_friend_rooms.sql` → `migration_hardening.sql` → `migration_friendship_guard.sql` → `migration_blocks.sql` → `migration_room_security.sql` → `migration_privacy.sql` → `migration_least_privilege.sql` の順に実行します。

## 目標の試験・みんなで勉強タイム・試験別ページ

- **目標の試験**（`profiles.goal_exam`）：一覧は `lib/exams.ts`。ロビーの初回カード「あなたの目標は？」で選び、`POST /api/profile/goal`（service_role）で保存。公開列（プロフィール・ランキングに表示）。DB には `supabase/migration_exam.sql` を `migration_least_privilege.sql` の後に実行し、`supabase/tests/security_audit.sql` が「✅ 問題なし」になることを確認する。
- **同じ目標ランキング**：`/api/leaderboard?scope=exam`。同じ `goal_exam` の人（最大 2000 人）で既存の `get_leaderboard` を呼ぶ。目標が未設定ならランキングの「同じ目標」タブは出ない。
- **みんなで勉強タイム**：毎日 21:00 / 23:00（日本時間）。ロビーにカウントダウンを表示し、開始から 50 分間は「いま開催中」。会場は自由学習ルーム（`components/lobby/CommunitySession.tsx`）。
- **試験別ランディングページ**：`/exam/[slug]`（ログイン不要・静的生成・FAQPage の構造化データつき）。文章は `lib/examPages.ts`。sitemap にも掲載。

---

## 🔔 通知（Web Push）・アクセス解析・紹介リンク

### 環境変数（Vercel の Environment Variables に設定）

| 変数 | 内容 |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID 公開鍵（`npx web-push generate-vapid-keys` で生成した Public Key） |
| `VAPID_PRIVATE_KEY` | VAPID 秘密鍵（同じコマンドの Private Key。**絶対に公開しない**） |
| `VAPID_SUBJECT` | 連絡先。`mailto:you@example.com` の形式 |
| `CRON_SECRET` | 定期実行（毎日 21:00 JST の通知）用の合言葉。`openssl rand -hex 32` などで生成 |

- VAPID の 3 つが未設定なら、通知機能は自動的にオフになる（カードも表示されない）
- 紹介コードは `NEXTAUTH_SECRET` から作るので、これを変えると全員の紹介コードが変わる
- DB には `supabase/migration_push_referral.sql` を流し、そのあと `supabase/tests/security_audit.sql` が「✅ 問題なし」になることを確認する

### 仕組み

- **連続記録のお知らせ**：`vercel.json` の Cron が毎日 12:00 UTC（21:00 JST）に `/api/cron/reminders` を呼ぶ。
  昨日は勉強したのに今日はまだの人へ「🔥 連続◯日、今日も少しだけ」を 1 日 1 回まで送る。無効になった購読（404/410）は自動で削除
- **iPhone / iPad**：ホーム画面に追加したアプリ（iOS 16.4 以降）でだけ通知を受け取れる。それ以外ではカードに案内を表示
- **アクセス解析**：Vercel Web Analytics（Cookie なし）。Vercel のダッシュボードで Analytics を有効にする。
  URL の招待コード・部屋 ID・クエリは送信前に伏せ、イベントには個人情報を載せない（`lib/analytics.ts`）
- **紹介リンク**：`/r/<コード>` または `/?r=<コード>` で来た人の紹介コードを 30 日間 Cookie に保存し、新規登録時に `profiles.referred_code` に記録する。
  自分のコードとリンクは `GET /api/me/referral` で取得できる

## 勉強会・ピン・プレミアムの設定（2026-11 追加）

### 1. Supabase の SQL Editor で、この順に実行
1. `supabase/migration_study_groups.sql` … 勉強会のくり返し・招待
2. `supabase/migration_session_cron.sql` … 開始前通知を 5 分おきに実行（URL と `CRON_SECRET` を書き換えてから）
3. `supabase/migration_rooms_pins.sql` … 部屋を Room 1〜3 に整理・定員なし・ピン（理由／ひみつ）・マッチ・性別／Instagram・ブロック時の関係削除
4. `supabase/migration_premium.sql` … プレミアム（課金状態・申し込み時の同意の記録）
5. `supabase/migration_hardening_v2.sql` … セキュリティ再点検の対応（勉強会・参加者の書き込みをサーバー専用に、古い toggle_pin を無効化、ブロック時に入室権も削除、通知の連打防止、Stripe イベントの重複防止）
6. 最後に `supabase/tests/security_audit.sql` で「✅ 問題なし」を確認

### 2. Stripe（プレミアム）
1. Stripe で商品「プレミアム」を作り、価格を 2 つ作る：月額 480円・年額 3,800円（定期支払い・JPY）
2. Webhook を追加：URL `https://<本番URL>/api/billing/webhook`、イベント `checkout.session.completed` `customer.subscription.created` `customer.subscription.updated` `customer.subscription.deleted`
3. 「カスタマーポータル」を有効にする（解約・支払い方法の変更をオン）
4. Vercel の環境変数に追加：`STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` `STRIPE_PRICE_MONTHLY` `STRIPE_PRICE_YEARLY`（4 つそろうまで申し込みボタンは出ない）
5. 価格は「税込（tax_behavior = inclusive）」で作る。表示（`lib/premium.ts` の `PRICES`）と金額を必ず一致させる
6. 設定 → Checkout：「顧客のサブスクリプションを 1 つに制限」を ON（二重契約の防止）
7. カスタマーポータル：本番（live）モードでも保存する。解約は「期間の終了時」、日割りは「なし」、プランの切り替えは OFF（規約の「日割り・返金なし」と合わせる）
8. 設定 → Billing → サブスクリプションと請求：支払いの再試行がすべて失敗したら「サブスクリプションをキャンセル」にする
9. Webhook エンドポイントの API バージョンはどれでもよい（受け取った後に Stripe から最新の状態を取り直すため）
10. 設定 → 公開情報で利用規約の URL（`/terms`）を登録したら、環境変数 `STRIPE_REQUIRE_TOS=1` にすると、決済画面で規約への同意チェックが必須になる
11. BAN したユーザーのサブスクは自動で解約される（`/api/admin/ban`）。手作業でアカウントを消すときは、先に Stripe でサブスクを解約すること

### 3. 特定商取引法に基づく表記（/tokushoho）
Vercel の環境変数に `LEGAL_SELLER_NAME`（販売事業者名）・`LEGAL_EMAIL` を必ず入れる。任意で `LEGAL_MANAGER_NAME` `LEGAL_ADDRESS` `LEGAL_PHONE`（未設定なら「請求があれば遅滞なく開示」と表示）。
`LEGAL_SELLER_NAME` と `LEGAL_EMAIL`、Stripe の 3 つがそろうまで、申し込みボタンは出ません（「準備中」と表示）。

価格を変えるときは Stripe の価格と `lib/premium.ts` の `PRICES` の両方を変えること。
