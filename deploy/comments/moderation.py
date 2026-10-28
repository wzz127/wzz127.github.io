"""Private, single-owner moderation with revocable sessions and CSRF protection."""
import hashlib
import hmac
from http.cookies import SimpleCookie, CookieError
import json
from pathlib import Path
import secrets
import time
from urllib.parse import parse_qs, quote, unquote

COOKIE = '__Host-blog_comment_admin'
SESSION_SECONDS = 12 * 3600
PASSWORD_ITERATIONS = 600_000
ASSETS = Path(__file__).with_name('admin')


class AdminError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def ensure_schema(db):
    db.execute('CREATE TABLE IF NOT EXISTS admin_auth (id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, digest TEXT NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS admin_attempts (fingerprint TEXT NOT NULL, created INTEGER NOT NULL)')
    db.execute('CREATE INDEX IF NOT EXISTS admin_attempts_created ON admin_attempts(created)')


def password_digest(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), PASSWORD_ITERATIONS).hex()


def set_password(connect, password):
    if not isinstance(password, str) or not 16 <= len(password) <= 256:
        raise ValueError('管理密码长度须为 16–256 个字符')
    salt = secrets.token_hex(32)
    digest = password_digest(password, salt)
    with connect() as db:
        db.execute('INSERT OR REPLACE INTO admin_auth VALUES (1,?,?)', (salt, digest))
        db.execute('DELETE FROM admin_sessions')
        db.execute('DELETE FROM admin_attempts')


def token_hash(handler):
    try:
        cookie = SimpleCookie(handler.headers.get('Cookie', ''))
        token = cookie[COOKIE].value
        if len(token) != 43:
            return ''
        return hashlib.sha256(token.encode()).hexdigest()
    except (KeyError, ValueError, CookieError):
        return ''


def authenticated(handler, db):
    session = db.execute('SELECT * FROM admin_sessions WHERE token_hash=? AND expires>?',
                         (token_hash(handler), int(time.time()))).fetchone()
    if not session:
        raise AdminError(401, '请先登录评论后台')
    return session


def login(handler, connect, data, salt):
    password = data.get('password')
    if not isinstance(password, str) or not 1 <= len(password) <= 256:
        raise AdminError(400, '请输入管理密码')
    now = int(time.time())
    ip = handler.headers.get('X-Real-IP', handler.client_address[0])
    fingerprint = hashlib.sha256((salt + ip).encode()).hexdigest()
    # Record attempts before checking the password. The transaction serializes
    # expensive password checks and prevents parallel attempts bypassing limits.
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('DELETE FROM admin_attempts WHERE created<=?', (now - 900,))
        db.execute('DELETE FROM admin_sessions WHERE expires<=?', (now,))
        auth = db.execute('SELECT * FROM admin_auth WHERE id=1').fetchone()
        if not auth:
            raise AdminError(503, '后台尚未设置管理密码')
        attempts = db.execute('SELECT count(*) FROM admin_attempts WHERE fingerprint=?', (fingerprint,)).fetchone()[0]
        total = db.execute('SELECT count(*) FROM admin_attempts').fetchone()[0]
        if attempts >= 5 or total >= 50:
            raise AdminError(429, '登录尝试过多，请 15 分钟后重试')
        db.execute('INSERT INTO admin_attempts VALUES (?,?)', (fingerprint, now))
        valid = hmac.compare_digest(password_digest(password, auth['salt']), auth['digest'])
        if valid:
            db.execute('DELETE FROM admin_attempts WHERE fingerprint=?', (fingerprint,))
            token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
            db.execute('INSERT INTO admin_sessions VALUES (?,?,?)',
                       (hashlib.sha256(token.encode()).hexdigest(), csrf, now + SESSION_SECONDS))
    # Raise after commit so a failed password consumes an attempt.
    if not valid:
        raise AdminError(401, '管理密码不正确')
    handler.respond(200, {'csrf': csrf}, {'Set-Cookie': f'{COOKIE}={token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age={SESSION_SECONDS}'})


def titles(site):
    try:
        posts = json.loads((site / 'content.json').read_text())
        return {quote(unquote('/' + post['path']), safe='/'): post['title'] for post in posts}
    except (OSError, ValueError, KeyError, TypeError):
        return {}


def get(handler, connect, url, site):
    if url.path.startswith('/admin/comments'):
        assets = {'/admin/comments': ('index.html', 'text/html'),
                  '/admin/comments/': ('index.html', 'text/html'),
                  '/admin/comments/admin.js': ('admin.js', 'application/javascript'),
                  '/admin/comments/admin.css': ('admin.css', 'text/css')}
        asset = assets.get(url.path)
        if not asset:
            handler.respond(404, {'error': 'Not found'})
        else:
            handler.send_body(200, (ASSETS / asset[0]).read_bytes(), asset[1] + '; charset=utf-8')
        return True
    if not url.path.startswith('/api/comments/admin/'):
        return False
    with connect() as db:
        session = authenticated(handler, db)
        if url.path == '/api/comments/admin/session':
            handler.respond(200, {'csrf': session['csrf']})
        elif url.path == '/api/comments/admin/list':
            params = parse_qs(url.query)
            status = params.get('status', ['pending'])[0]
            page = params.get('page', ['1'])[0]
            if status not in ('pending', 'approved', 'rejected') or not page.isascii() or not page.isdigit() or not 1 <= int(page) <= 100000:
                raise AdminError(400, '列表参数无效')
            page = int(page)
            counts = dict.fromkeys(('pending', 'approved', 'rejected'), 0)
            counts.update({r['status']: r['n'] for r in db.execute('SELECT status,count(*) n FROM comments GROUP BY status')})
            rows = db.execute('SELECT id,path,nickname,email,content,created,status FROM comments WHERE status=? ORDER BY id DESC LIMIT 20 OFFSET ?',
                              (status, (page - 1) * 20)).fetchall()
            names = titles(site)
            comments = [dict(row, title=names.get(row['path'], unquote(row['path']))) for row in rows]
            handler.respond(200, {'comments': comments, 'counts': counts, 'page': page, 'hasMore': page * 20 < counts[status]})
        else:
            handler.respond(404, {'error': 'Not found'})
    return True


def post(handler, connect, url, data, salt):
    if url.path == '/api/comments/admin/login':
        login(handler, connect, data, salt)
        return
    with connect() as db:
        session = authenticated(handler, db)
        csrf = handler.headers.get('X-CSRF-Token', '')
        if not hmac.compare_digest(csrf.encode(), session['csrf'].encode()):
            raise AdminError(403, '操作验证已失效，请刷新页面')
        if url.path == '/api/comments/admin/logout':
            db.execute('DELETE FROM admin_sessions WHERE token_hash=?', (session['token_hash'],))
            message = '已退出登录'
            headers = {'Set-Cookie': f'{COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0'}
        elif url.path == '/api/comments/admin/moderate':
            id, status, expected = data.get('id'), data.get('status'), data.get('expectedStatus')
            if type(id) is not int or not 0 < id < 2**63 or status not in ('approved', 'rejected') or expected not in ('pending', 'approved', 'rejected'):
                raise AdminError(400, '审核参数无效')
            changed = db.execute('UPDATE comments SET status=? WHERE id=? AND status=?', (status, id, expected))
            if changed.rowcount != 1:
                if not db.execute('SELECT 1 FROM comments WHERE id=?', (id,)).fetchone():
                    raise AdminError(404, '评论不存在')
                raise AdminError(409, '评论状态已变化，请刷新后重试')
            message = '已通过，评论已公开展示' if status == 'approved' else '已拒绝，评论不会公开展示'
            headers = {}
        else:
            raise AdminError(404, 'Not found')

    handler.respond(200, {'message': message}, headers)
