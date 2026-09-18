import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const entries = (await getCollection('log', (e) => !e.data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  return rss({
    title: 'Brandon Greene — build log',
    description: 'Dated entries showing work in progress across my projects.',
    site: context.site,
    items: entries.map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.date,
      link: `/log#${entry.id}`,
    })),
  });
}
