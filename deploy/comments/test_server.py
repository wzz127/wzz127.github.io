import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import server


class CommentsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        server.DB = self.tmp.name + '/comments.db'
        server.SITE = Path(self.tmp.name)
        (server.SITE / 'post').mkdir()
        (server.SITE / 'post/index.html').write_text('<form id="guest-comment-form">')
        os.environ['COMMENTS_SALT'] = 'test-salt' * 8
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.http.server_port)

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def submit(self, **overrides):
        data = dict(path='/post/', nickname='访客', email='', content='<script>alert(1)</script>')
        data.update(overrides)
        server.submit(data, '127.0.0.1')

    def get(self, path):
        with urlopen(self.base + path) as response:
            return json.load(response)

    def test_private_until_approved_and_no_email(self):
        self.submit(email='private@example.com')
        self.assertEqual(self.get('/api/comments?path=/post/')['comments'], [])
        self.assertEqual(self.get('/api/comments/counts')['counts'], {})
        with server.connect() as db:
            db.execute("UPDATE comments SET status='approved'")
        public = self.get('/api/comments?path=/post/')
        self.assertEqual(public['comments'][0]['nickname'], '访客')
        self.assertNotIn('email', public['comments'][0])
        self.assertNotIn('fingerprint', public['comments'][0])
        self.assertEqual(self.get('/api/comments/counts')['counts'], {'/post/': 1})
        with server.connect() as db:
            db.execute("UPDATE comments SET status='rejected'")
        self.assertEqual(self.get('/api/comments?path=/post/')['comments'], [])

    def test_validation_and_rate_limit(self):
        for bad in [dict(nickname='a'*41), dict(email='invalid'), dict(content=' '), dict(content='a'*3001), dict(path='/../'), dict(path='/missing/'), dict(website='spam')]:
            with self.assertRaises(ValueError):
                self.submit(**bad)
        self.submit()
        with self.assertRaises(OverflowError):
            self.submit()

    def test_anonymous_defaults_still_require_moderation(self):
        cases = [({}, '匿名'), ({'nickname': ''}, '匿名'),
                 ({'nickname': ' \t '}, '匿名'), ({'nickname': '  读者  '}, '读者')]
        for i, (fields, expected) in enumerate(cases):
            with self.subTest(fields=fields):
                data = dict(path='/post/', content='匿名评论仍需审核', **fields)
                server.submit(data, '192.0.2.' + str(i))
                with server.connect() as db:
                    row = db.execute('SELECT id,nickname,status FROM comments ORDER BY id DESC LIMIT 1').fetchone()
                    self.assertEqual(row['nickname'], expected)
                    self.assertEqual(row['status'], 'pending')
        self.assertEqual(self.get('/api/comments?path=/post/')['comments'], [])
        self.assertEqual(self.get('/api/comments/counts')['counts'], {})
        with server.connect() as db:
            db.execute("UPDATE comments SET status='approved' WHERE id=1")
        public = self.get('/api/comments?path=/post/')['comments']
        self.assertEqual(len(public), 1)
        self.assertEqual(public[0]['nickname'], '匿名')
        self.assertEqual(self.get('/api/comments/counts')['counts'], {'/post/': 1})

    def test_http_origin_and_submission(self):
        data = json.dumps(dict(path='/post/', content='hello')).encode()
        request = Request(self.base + '/api/comments', data=data, headers={'Content-Type': 'application/json', 'Origin': 'https://evil.example'})
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 403)
        request.headers['Origin'] = server.ORIGIN
        with urlopen(request) as response:
            self.assertEqual(response.status, 201)
        self.assertEqual(self.get('/api/comments?path=/post/')['comments'], [])


if __name__ == '__main__':
    unittest.main()
