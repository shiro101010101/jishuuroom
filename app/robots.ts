import type { MetadataRoute } from 'next'
import { SITE } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/terms', '/privacy', '/exam/'], disallow: ['/api/', '/room/', '/lobby', '/invite/', '/banned'] }],
    sitemap: `${SITE.url}/sitemap.xml`,
  }
}
