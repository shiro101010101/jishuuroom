// app/exam/[slug]/page.tsx — 試験別のランディングページ（ログイン不要・静的生成）
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SITE } from '@/lib/site'
import ThemeToggle from '@/components/ThemeToggle'
import { EXAMS } from '@/lib/exams'
import { getExamPage, EXAM_PAGE_SLUGS } from '@/lib/examPages'
import styles from '@/components/exam/ExamLanding.module.css'

export const dynamicParams = false

export function generateStaticParams() {
  return EXAM_PAGE_SLUGS.map(slug => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = getExamPage(slug)
  if (!page) return {}
  const title = `${page.name}対策のオンライン自習室 | ${SITE.name}`
  return {
    title,
    description: page.description,
    alternates: { canonical: `/exam/${page.slug}` },
    openGraph: { type: 'website', locale: 'ja_JP', siteName: SITE.name, title, description: page.description, url: `/exam/${page.slug}` },
    twitter: { card: 'summary_large_image', title, description: page.description },
  }
}

const BENEFITS = [
  { icon: '👥', title: '全国の仲間と同じ時間に', body: 'カメラをつないで、画面越しに一緒に勉強。カメラ OFF・マイクなしでも参加できるので、気軽に始められます。' },
  { icon: '⏱️', title: 'ポモドーロで集中が続く', body: '25 分集中・5 分休憩のタイマーつき。集中した時間だけが自動で記録され、連続日数も残ります。' },
  { icon: '🏆', title: '同じ目標の人とランキング', body: '今日・今週・今月の勉強時間ランキング。同じ試験をめざす人どうしで比べられるので、ちょうどいい刺激になります。' },
]

export default async function ExamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = getExamPage(slug)
  if (!page) notFound()

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  }
  const others = EXAMS.filter(e => e.slug !== page.slug)

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}/>
      <header className={styles.header}>
        <Link href="/" className={styles.logo}><span className={styles.logoMark}>自</span>{SITE.name}</Link>
        <div className={styles.headerRight}>
          <ThemeToggle/>
          <Link href="/" className={styles.headerCta}>ログイン</Link>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.eyebrow}>{page.emoji} {page.name} ・ 無料のオンライン自習室</div>
          <h1 className={styles.h1}>{page.name}対策の<br className={styles.br}/>オンライン自習室</h1>
          <p className={styles.lead}>{page.lead}</p>
          <div className={styles.ctaRow}>
            <Link href="/" className={styles.cta}>無料ではじめる</Link>
            <span className={styles.ctaNote}>Google / LINE でログイン ・ カメラ OFF でも OK</span>
          </div>
        </section>

        <section aria-labelledby="benefits">
          <h2 id="benefits" className={styles.h2}>{SITE.name}でできること</h2>
          <div className={styles.benefits}>
            {BENEFITS.map(b => (
              <div key={b.title} className={styles.card}>
                <div className={styles.cardIcon} aria-hidden>{b.icon}</div>
                <h3 className={styles.cardTitle}>{b.title}</h3>
                <p className={styles.cardBody}>{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="tips" className={styles.panel}>
          <h2 id="tips" className={styles.h2}>{page.name}の勉強での使い方</h2>
          <ul className={styles.tips}>
            {page.tips.map(t => <li key={t}>{t}</li>)}
          </ul>
        </section>

        <section aria-labelledby="faq">
          <h2 id="faq" className={styles.h2}>よくある質問</h2>
          <div className={styles.faq}>
            {page.faq.map(f => (
              <details key={f.q} className={styles.faqItem}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.final}>
          <h2 className={styles.finalTitle}>今日の 25 分を、いっしょに。</h2>
          <p className={styles.finalBody}>毎晩 21:00 と 23:00 は「みんなで勉強」の時間。{page.name}をめざす仲間が待っています。</p>
          <Link href="/" className={styles.cta}>無料ではじめる</Link>
        </section>

        <nav aria-label="ほかの目標" className={styles.others}>
          <h2 className={styles.h2}>ほかの目標の自習室</h2>
          <div className={styles.otherLinks}>
            {others.map(e => <Link key={e.slug} href={`/exam/${e.slug}`}>{e.emoji} {e.label}</Link>)}
          </div>
        </nav>
      </main>

      <footer className={styles.footer}>
        <Link href="/terms">利用規約</Link>
        <Link href="/privacy">プライバシーポリシー</Link>
      </footer>
    </div>
  )
}
