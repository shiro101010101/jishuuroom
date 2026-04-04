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

---

### STEP 3 — Supabase のキーを取得

1. 左メニュー **Settings → API** を開く
2. 以下をメモする：
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon / public** → `eyJhbG...`
   - **service_role** → `eyJhbG...`（⚠️ 絶対に公開しない）

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
