import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';

const root = fileURLToPath(new URL('../', import.meta.url));
const query = `query($owner: String!, $name: String!, $category: ID!, $after: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 100, categoryId: $category, after: $after) {
      nodes { body comments { totalCount } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export async function commentSnapshot({ repo, category, urls, token, fetchImpl = fetch }) {
  const [owner, name] = repo.split('/');
  const paths = urls.map(url => new URL(url).pathname);
  const hashes = new Map(paths.map(path => [
    createHash('sha1').update(path.substring(1).replace(/\.\w+$/, '')).digest('hex'), path
  ]));
  const counts = Object.fromEntries(paths.map(path => [path, 0]));
  let after = null;
  do {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner, name, category, after } }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`GitHub comment query failed (${response.status})`);
    const result = await response.json();
    if (result.errors?.length) throw new Error('GitHub could not return a complete comment snapshot');
    const discussions = result.data?.repository?.discussions;
    if (!Array.isArray(discussions?.nodes) || !discussions.pageInfo) {
      throw new Error('Invalid GitHub discussion response');
    }
    for (const discussion of discussions.nodes) {
      const hash = /<!-- sha1: ([a-f0-9]{40}) -->/.exec(discussion.body)?.[1];
      const path = hashes.get(hash);
      if (!path) continue;
      const count = discussion.comments?.totalCount;
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid comment count');
      counts[path] = count;
    }
    after = discussions.pageInfo.hasNextPage ? discussions.pageInfo.endCursor : null;
    if (discussions.pageInfo.hasNextPage && !after) throw new Error('Missing discussion cursor');
  } while (after);
  return { repo, generatedAt: new Date().toISOString(), counts };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN with discussions:read is required to sync comment counts');
  const $ = load(readFileSync(resolve(root, 'public/index.html'), 'utf8'));
  const script = $('script[data-comments-url]');
  const repo = script.attr('data-repo');
  const category = script.attr('data-category-id');
  if (!repo || !category) throw new Error('Missing giscus repository/category configuration');
  const site = $('link[rel="canonical"]').attr('href');
  const posts = JSON.parse(readFileSync(resolve(root, 'public/content.json'), 'utf8'));
  const snapshot = await commentSnapshot({
    repo, category, urls: posts.map(post => new URL(post.path, site).href), token
  });
  const output = resolve(root, process.argv[2] || 'public/post-comments.json');
  writeFileSync(output, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`Updated comment counts for ${posts.length} posts.`);
}
