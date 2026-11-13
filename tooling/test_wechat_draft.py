import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('worker', Path(__file__).with_name('wechat-draft-worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class DraftTests(unittest.TestCase):
    def setUp(self):
        self.payload = {'mode': 'create', 'title': '为什么“别碰”？', 'author': 'k_fad',
                        'digest': '摘要', 'source_url': 'https://example.org/post/',
                        'article': '<p>第一段</p><p>第二段</p>', 'image_count': 0,
                        'cover_key': 'cover', 'assets': [{'key': 'cover', 'name': 'cover.png',
                        'mime': 'image/png', 'sources': [], 'data': 'eA=='}]}
        self.article = {key: self.payload[key] for key in ('title', 'author', 'digest')}
        self.article.update(content=self.payload['article'], content_source_url=self.payload['source_url'], thumb_media_id='cover-id')
        self.events, self.calls = [], []

    def api(self, existing=False, mismatch=False):
        def request(path, **kwargs):
            self.calls.append(path)
            if path.endswith('batchget'):
                items = [{'media_id': 'existing', 'content': {'news_item': [self.article]}}] if existing else []
                return {'total_count': len(items), 'item': items}
            if path.endswith('/get'):
                article = dict(self.article)
                if mismatch:
                    article['content'] = '<p>不同的正文</p>'
                return {'news_item': [article]}
            if path.endswith('add_material'):
                return {'media_id': 'cover-id', 'url': 'https://mmbiz.qpic.cn/image'}
            if path.endswith('/add'):
                return {'media_id': 'created'}
            self.fail('Unexpected endpoint ' + path)
        return request

    def test_existing_draft_is_verified_without_upload_or_creation(self):
        worker.run(self.payload, self.api(existing=True), self.events.append)
        self.assertTrue(self.events[-1]['verified'])
        self.assertEqual(self.calls, ['/cgi-bin/draft/batchget', '/cgi-bin/draft/get'])

    def test_mismatched_draft_stops_without_duplicate(self):
        with self.assertRaises(RuntimeError):
            worker.run(self.payload, self.api(existing=True, mismatch=True), self.events.append)
        self.assertNotIn('/cgi-bin/draft/add', self.calls)

    def test_creation_id_emitted_even_when_readback_fails(self):
        with self.assertRaises(RuntimeError):
            worker.run(self.payload, self.api(mismatch=True), self.events.append)
        self.assertEqual([e['draft_media_id'] for e in self.events if e['stage'] == 'created'], ['created'])
        self.assertEqual(self.calls.count('/cgi-bin/draft/add'), 1)

    def test_utf8_response_ignores_incorrect_http_charset(self):
        class Response:
            content = '{"title":"为什么“别碰”？"}'.encode('utf-8')
            encoding = 'ISO-8859-1'
        self.assertEqual(worker.decode_response(Response())['title'], self.payload['title'])


if __name__ == '__main__':
    unittest.main()
