import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { commentSnapshot } from './sync-comments.mjs';

const repo = 'wzz127/wzz127.github.io';
const url = 'https://blog.kfad127.xyz/2018/05/04/impala测试/';
const path = new URL(url).pathname;
const hash = createHash('sha1').update(path.substring(1)).digest('hex');

test('comment snapshot follows pagination and matches strict giscus hashes for Chinese URLs', async () => {
  const cursors = [];
  const snapshot = await commentSnapshot({
    repo, category: 'category-id', urls: [url, 'https://wzz127.github.io/no-comments/'], token: 'test',
    async fetchImpl(_, options) {
      const { variables } = JSON.parse(options.body);
      cursors.push(variables.after);
      return { ok: true, json: async () => ({ data: { repository: { discussions: {
        nodes: variables.after ? [{ body: `<!-- sha1: ${hash} -->`, comments: { totalCount: 4 } }] : [],
        pageInfo: { hasNextPage: !variables.after, endCursor: variables.after ? null : 'next-page' }
      } } } }) };
    }
  });
  assert.deepEqual(cursors, [null, 'next-page']);
  assert.equal(snapshot.counts[path], 4);
  assert.equal(snapshot.counts['/no-comments/'], 0);
});

test('partial GitHub errors fail the snapshot instead of publishing fake zero counts', async () => {
  await assert.rejects(commentSnapshot({
    repo, category: 'category-id', urls: [url], token: 'test',
    fetchImpl: async () => ({ ok: true, json: async () => ({ errors: [{ message: 'Rate limited' }] }) })
  }), /complete comment snapshot/);
});
