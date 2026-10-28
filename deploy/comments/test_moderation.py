from http.cookies import SimpleCookie
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
import server
import moderation


class AdminTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        server.DB = self.tmp.name + '/comments.db'
        server.SITE = Path(self.tmp.name)
        (server.SITE / 'post').mkdir()
        (server.SITE / 'post/index.html').write_text('<form id="guest-comment-form">')
        (server.SITE / 'content.json').write_text(json.dumps([{'path': 'post/', 'title': '测试文章'}]))
        os.environ['COMMENTS_SALT'] = 'test-salt' * 8
        self.password = 'test-admin-password-long-enough'
        moderation.set_password(server.connect, self.password)
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.thread = threading.Thread(target=self.http.serve_forever)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.http.server_port)

    def tearDown(self):
        self.http.shutdown(); self.http.server_close(); self.thread.join(); self.tmp.cleanup()

    def request(self, path, data=None, cookie='', csrf='', origin=server.ORIGIN):
        headers = {'Cookie': cookie, 'Origin': origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf}
        request = Request(self.base + path, data=None if data is None else json.dumps(data).encode(), headers=headers)
        try:
            response = urlopen(request)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read()
            body = json.loads(raw) if response.headers.get('Content-Type', '').startswith('application/json') else raw.decode()
            return response.status, body, response.headers

    def login(self):
        code, body, headers = self.request('/api/comments/admin/login', {'password': self.password})
        self.assertEqual(code, 200)
        return headers['Set-Cookie'].split(';')[0], body['csrf'], headers

    def test_auth_cookie_logout_and_password_rotation(self):
        self.assertEqual(self.request('/api/comments/admin/list')[0], 401)
        self.assertEqual(self.request('/api/comments/admin/moderate', {'id': 1})[0], 401)
        cookie, csrf, headers = self.login()
        parsed = SimpleCookie(headers['Set-Cookie'])[moderation.COOKIE]
        self.assertTrue(parsed['secure']); self.assertTrue(parsed['httponly'])
        self.assertEqual(parsed['samesite'], 'Strict'); self.assertEqual(parsed['path'], '/')
        self.assertEqual(self.request('/api/comments/admin/session', cookie=cookie)[1]['csrf'], csrf)
        self.assertEqual(self.request('/api/comments/admin/logout', {}, cookie, csrf)[0], 200)
        self.assertEqual(self.request('/api/comments/admin/list', cookie=cookie)[0], 401)
        cookie, csrf, _ = self.login()
        with server.connect() as db:
            db.execute('UPDATE admin_sessions SET expires=0')
        self.assertEqual(self.request('/api/comments/admin/session', cookie=cookie)[0], 401)
        cookie, csrf, _ = self.login()
        moderation.set_password(server.connect, 'replacement-password-long-enough')
        self.assertEqual(self.request('/api/comments/admin/session', cookie=cookie)[0], 401)
        self.assertEqual(self.request('/api/comments/admin/login', {'password': self.password})[0], 401)

    def test_moderation_protects_origin_csrf_and_stale_actions(self):
        server.submit({'path': '/post/', 'content': '<b>plain text</b>', 'email': 'private@example.invalid'}, 'test')
        cookie, csrf, _ = self.login()
        result = self.request('/api/comments/admin/list', cookie=cookie)[1]
        comment = result['comments'][0]
        self.assertEqual(comment['nickname'], '匿名')
        self.assertEqual(comment['title'], '测试文章')
        self.assertEqual(comment['email'], 'private@example.invalid')
        data = {'id': comment['id'], 'status': 'approved', 'expectedStatus': 'pending'}
        self.assertEqual(self.request('/api/comments/admin/moderate', data, cookie)[0], 403)
        self.assertEqual(self.request('/api/comments/admin/moderate', data, cookie, csrf, 'https://evil.example')[0], 403)
        self.assertEqual(self.request('/api/comments?path=/post/')[1]['comments'], [])
        self.assertEqual(self.request('/api/comments/admin/moderate', data, cookie, csrf)[0], 200)
        public = self.request('/api/comments?path=/post/')[1]['comments']
        self.assertEqual(len(public), 1); self.assertNotIn('email', public[0])
        self.assertEqual(self.request('/api/comments/counts')[1]['counts'], {'/post/': 1})
        self.assertEqual(self.request('/api/comments/admin/moderate', data, cookie, csrf)[0], 409)
        data.update(status='rejected', expectedStatus='approved')
        self.assertEqual(self.request('/api/comments/admin/moderate', data, cookie, csrf)[0], 200)
        self.assertEqual(self.request('/api/comments?path=/post/')[1]['comments'], [])
        self.assertEqual(self.request('/api/comments/counts')[1]['counts'], {})

    def test_login_rate_limit_and_no_password_leak(self):
        for _ in range(5):
            code, _, _ = self.request('/api/comments/admin/login', {'password': 'wrong'})
            self.assertEqual(code, 401)
        self.assertEqual(self.request('/api/comments/admin/login', {'password': self.password})[0], 429)
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM admin_attempts').fetchone()[0], 5)
            auth = dict(db.execute('SELECT * FROM admin_auth').fetchone())
            self.assertNotIn(self.password, json.dumps(auth))
            db.execute('UPDATE admin_attempts SET created=0')
        self.assertEqual(self.request('/api/comments/admin/login', {'password': self.password})[0], 200)

    def test_pagination_filters_and_asset_security(self):
        for i in range(21):
            server.submit({'path': '/post/', 'content': str(i)}, str(i))
        cookie, _, _ = self.login()
        first = self.request('/api/comments/admin/list', cookie=cookie)[1]
        second = self.request('/api/comments/admin/list?page=2', cookie=cookie)[1]
        self.assertEqual(len(first['comments']), 20); self.assertTrue(first['hasMore'])
        self.assertEqual(len(second['comments']), 1); self.assertFalse(second['hasMore'])
        self.assertEqual(first['counts']['pending'], 21)
        self.assertEqual(self.request('/api/comments/admin/list?status=bad', cookie=cookie)[0], 400)
        code, body, headers = self.request('/admin/comments/')
        self.assertEqual(code, 200); self.assertIn('管理密码', body)
        self.assertNotIn(self.password, body)
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
        self.assertEqual(self.request('/admin/comments/../../server.py')[0], 404)
