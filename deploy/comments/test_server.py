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
        for bad in [dict(nickname=' '), dict(email='invalid'), dict(content=' '), dict(content='a'*3001), dict(path='/../'), dict(path='/missing/'), dict(website='spam')]:
            with self.assertRaises(ValueError):
                self.submit(**bad)
        self.submit()
        with self.assertRaises(OverflowError):
            self.submit()

    def test_http_origin_and_submission(self):
        data = json.dumps(dict(path='/post/', nickname='guest', content='hello')).encode()
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
