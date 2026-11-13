import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'
import { EXAM_PAGE_SLUGS } from '@/lib/examPages'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE.url}/`, changeFrequency: 'weekly', priority: 1 },
    ...EXAM_PAGE_SLUGS.map(slug => ({ url: `${SITE.url}/exam/${slug}`, changeFrequency: 'monthly' as const, priority: 0.7 })),
    { url: `${SITE.url}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE.url}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
