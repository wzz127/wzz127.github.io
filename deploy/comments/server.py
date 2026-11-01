"""Guest comments: private SQLite storage, public approved-only API, local moderation CLI."""
import argparse
from contextlib import contextmanager
import hashlib
import getpass
import sys
import moderation
import json
import os
from pathlib import Path
import re
import sqlite3
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit, unquote, quote

DB = os.environ.get('COMMENTS_DB', '/data/comments.sqlite3')
ORIGIN = os.environ.get('COMMENTS_ORIGIN', 'https://blog.kfad127.xyz')
SITE = Path(os.environ.get('COMMENTS_SITE', '/srv/site/current'))


@contextmanager
def connect():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute('''CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY, path TEXT NOT NULL, nickname TEXT NOT NULL,
        email TEXT NOT NULL, content TEXT NOT NULL, created INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', fingerprint TEXT NOT NULL)''')
    db.execute('CREATE INDEX IF NOT EXISTS comments_path ON comments(path, status)')
    db.execute('CREATE INDEX IF NOT EXISTS comments_rate ON comments(fingerprint, created)')
    moderation.ensure_schema(db)
    try:
        with db:
            yield db
    finally:
        db.close()


def article_path(value):
    if not isinstance(value, str) or len(value) > 1500:
        raise ValueError('文章地址无效')
    decoded = unquote(value)
    if not decoded.startswith('/') or not decoded.endswith('/') or any(x in decoded for x in ('..', '\\', '?', '#', '\x00')):
        raise ValueError('文章地址无效')
    # Only pages with an enabled comment form accept submissions.
    file = SITE / decoded.lstrip('/') / 'index.html'
    if not file.is_file() or 'id="guest-comment-form"' not in file.read_text():
        raise ValueError('这篇文章未开放访客评论')
    return quote(decoded, safe='/')


def submit(data, ip):
    if not isinstance(data, dict):
        raise ValueError('提交格式无效')
    for key, limit in [('nickname', 40), ('email', 254), ('content', 3000)]:
        value = data.get(key, '')
        if not isinstance(value, str) or len(value.strip()) > limit:
            raise ValueError('昵称、邮箱或评论长度无效')
        data[key] = value.strip()
    data['nickname'] = data['nickname'] or '匿名'
    if not data['content']:
        raise ValueError('请填写评论内容')
    if data['email'] and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', data['email']):
        raise ValueError('邮箱格式不正确')
    if data.get('website'):
        raise ValueError('提交失败，请稍后重试')
    path = article_path(data.get('path'))
    now = int(time.time())
    fingerprint = hashlib.sha256((os.environ['COMMENTS_SALT'] + ip).encode()).hexdigest()
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        recent = db.execute('SELECT created FROM comments WHERE fingerprint=? AND created>?', (fingerprint, now - 3600)).fetchall()
        if len(recent) >= 5 or any(row['created'] > now - 60 for row in recent):
            raise OverflowError('提交太频繁，请稍后再试')
        db.execute('INSERT INTO comments(path,nickname,email,content,created,fingerprint) VALUES(?,?,?,?,?,?)',
                   (path, data['nickname'], data['email'], data['content'], now, fingerprint))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Do not log commenter information or request bodies.

    def send_body(self, status, raw, content_type, headers=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('X-Robots-Tag', 'noindex, nofollow')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(raw)

    def respond(self, status, body, headers=None):
        self.send_body(status, json.dumps(body, ensure_ascii=False).encode(), 'application/json; charset=utf-8', headers)

    def do_GET(self):
        url = urlsplit(self.path)
        try:
            if moderation.get(self, connect, url, SITE):
                return
        except moderation.AdminError as e:
            return self.respond(e.status, {'error': e.message})
        except Exception:
            return self.respond(503, {'error': '暂时无法加载，请稍后重试'})
        with connect() as db:
            if url.path == '/api/comments/counts':
                counts = {r['path']: r['n'] for r in db.execute("SELECT path,count(*) n FROM comments WHERE status='approved' GROUP BY path")}
                return self.respond(200, {'counts': counts})
            if url.path != '/api/comments':
                return self.respond(404, {'error': 'Not found'})
            try:
                path = article_path(parse_qs(url.query).get('path', [''])[0])
            except ValueError as e:
                return self.respond(400, {'error': str(e)})
            rows = db.execute("SELECT id,nickname,content,created FROM comments WHERE path=? AND status='approved' ORDER BY id DESC LIMIT 100", (path,)).fetchall()
            self.respond(200, {'comments': [dict(r) for r in rows]})

    def do_POST(self):
        url = urlsplit(self.path)
        is_admin = url.path.startswith('/api/comments/admin/')
        if url.path != '/api/comments' and not is_admin:
            return self.respond(404, {'error': 'Not found'})
        if self.headers.get('Origin') != ORIGIN:
            return self.respond(403, {'error': '请求来源无效'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.respond(415, {'error': '提交格式无效'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 20000:
                return self.respond(413, {'error': '评论内容过长'})
            self.connection.settimeout(10)
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError('提交格式无效')
            if is_admin:
                moderation.post(self, connect, url, data, os.environ['COMMENTS_SALT'])
                return
            # Caddy overwrites this header; service port is bound to loopback only.
            submit(data, self.headers.get('X-Real-IP', self.client_address[0]))
            self.respond(201, {'message': '评论已提交，审核通过后会显示。'})
        except moderation.AdminError as e:
            self.respond(e.status, {'error': e.message})
        except (ValueError, UnicodeError):
            self.respond(400, {'error': '请检查文章地址、昵称、邮箱和评论内容'})
        except OverflowError as e:
            self.respond(429, {'error': str(e)})
        except Exception:
            self.respond(503, {'error': '暂时无法提交，请稍后重试'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['serve', 'pending', 'approve', 'reject', 'set-admin-password'])
    parser.add_argument('id', type=int, nargs='?')
    args = parser.parse_args()
    if args.action == 'set-admin-password':
        password = getpass.getpass('管理密码（至少 16 个字符）：') if sys.stdin.isatty() else sys.stdin.readline().rstrip('\r\n')
        moderation.set_password(connect, password)
        print('管理密码已设置，原有登录已失效')
        return
    with connect() as db:
        if args.action == 'pending':
            for row in db.execute("SELECT id,path,nickname,email,content,created FROM comments WHERE status='pending' ORDER BY id"):
                print(json.dumps(dict(row), ensure_ascii=False))
        elif args.action in ('approve', 'reject'):
            if args.id is None:
                parser.error('请提供评论 ID')
            result = db.execute('UPDATE comments SET status=? WHERE id=?', ('approved' if args.action == 'approve' else 'rejected', args.id))
            if not result.rowcount:
                parser.error('评论不存在')
            print('已更新评论', args.id)
    if args.action == 'serve':
        if len(os.environ.get('COMMENTS_SALT', '')) < 32:
            raise RuntimeError('COMMENTS_SALT must contain at least 32 characters')
        ThreadingHTTPServer((os.environ.get('COMMENTS_HOST', '0.0.0.0'), 8080), Handler).serve_forever()


if __name__ == '__main__':
    main()
