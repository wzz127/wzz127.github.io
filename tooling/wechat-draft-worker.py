"""SSH worker, compatible with server Python 3.6. Draft-only; no publish API."""
import base64
import html
import io
import json
import re
import sys
from html.parser import HTMLParser


class ArticleText(HTMLParser):
    def __init__(self):
        HTMLParser.__init__(self, convert_charrefs=True)
        self.parts = []

    def handle_data(self, value):
        self.parts.append(value)


def normalized_text(content):
    parser = ArticleText()
    parser.feed(content)
    return re.sub(r'\s+', '', ''.join(parser.parts))


def decode_response(response):
    # WeChat may advertise ISO-8859-1 while actually returning UTF-8.
    return json.loads(response.content.decode('utf-8'))


def run(payload, request, report):
    def verify(media_id):
        result = request('/cgi-bin/draft/get', body={'media_id': media_id})
        articles = result.get('news_item', [])
        if len(articles) != 1:
            raise RuntimeError('Expected one article; existing draft left unchanged')
        article = articles[0]
        images = re.findall(r'<img\b[^>]*\bsrc=["\x27]([^"\x27]+)', article['content'])
        verified = (
            article['title'] == payload['title']
            and normalized_text(article['content']) == normalized_text(payload['article'])
            and article.get('author') == payload['author']
            and article.get('digest') == payload['digest']
            and article.get('content_source_url') == payload['source_url']
            and bool(article.get('thumb_media_id'))
            and len(images) == payload['image_count']
            and all(re.match(r'https?://mmbiz\.(qpic|qlogo)\.cn/', url) for url in images)
        )
        report({'stage': 'verified', 'title': article['title'], 'draft_media_id': media_id,
                'verified': bool(verified), 'mode': 'draft', 'has_cover': bool(article.get('thumb_media_id')),
                'body_images': len(images), 'source_url': article.get('content_source_url')})
        if not verified:
            raise RuntimeError('Draft readback differs; no duplicate created and no existing draft changed')

    if payload['mode'] == 'verify':
        verify(payload['media_id'])
        return
    offset, matches = 0, []
    while True:
        result = request('/cgi-bin/draft/batchget', body={'offset': offset, 'count': 20, 'no_content': 0})
        items = result.get('item', [])
        for item in items:
            if any(a.get('title') == payload['title'] for a in item.get('content', {}).get('news_item', [])):
                matches.append(item['media_id'])
        offset += len(items)
        if not items or offset >= result.get('total_count', 0):
            break
    report({'stage': 'inspect', 'api_access': True, 'total_drafts': result.get('total_count'),
            'matching_drafts': matches})
    if payload['mode'] == 'inspect':
        return
    if matches:
        if len(matches) != 1:
            raise RuntimeError('Multiple matching drafts; inspect manually before any changes')
        verify(matches[0])
        return
    article, media = payload['article'], {}
    for asset in payload['assets']:
        uploaded = request('/cgi-bin/material/add_material', params={'type': 'image'},
                           files={'media': (asset['name'], io.BytesIO(base64.b64decode(asset['data'])), asset['mime'])})
        if not uploaded.get('media_id') or not uploaded.get('url'):
            raise RuntimeError('Image upload incomplete; draft not created')
        media[asset['key']] = uploaded
        report({'stage': 'image_uploaded', 'asset': asset['key'], 'media_id': uploaded['media_id']})
        for source in asset['sources']:
            article = article.replace('src="' + html.escape(source, quote=True) + '"',
                                      'src="' + html.escape(uploaded['url'], quote=True) + '"')
    created = request('/cgi-bin/draft/add', body={'articles': [{
        'title': payload['title'], 'author': payload['author'], 'digest': payload['digest'],
        'content': article, 'content_source_url': payload['source_url'],
        'thumb_media_id': media[payload['cover_key']]['media_id'],
        'need_open_comment': 0, 'only_fans_can_comment': 0,
    }]})
    media_id = created['media_id']
    # Emit immediately: caller keeps this ID even if verification fails or SSH times out.
    report({'stage': 'created', 'title': payload['title'], 'draft_media_id': media_id, 'mode': 'draft'})
    verify(media_id)


def main():
    import fcntl
    import requests
    payload = json.load(sys.stdin)
    credentials = payload.pop('credentials')
    token = [None]

    def report(data):
        print(json.dumps(data, ensure_ascii=False), flush=True)

    def request(path, body=None, params=None, files=None):
        allowed = {'/cgi-bin/draft/get', '/cgi-bin/draft/batchget',
                   '/cgi-bin/draft/add', '/cgi-bin/material/add_material'}
        if path not in allowed:
            raise RuntimeError('Endpoint is outside draft-only scope')
        if token[0] is None:
            response = requests.post('https://api.weixin.qq.com/cgi-bin/stable_token', json={
                'grant_type': 'client_credential', 'appid': credentials['WECHAT_MP_APPID'],
                'secret': credentials['WECHAT_MP_SECRET'], 'force_refresh': False,
            }, timeout=30)
            data = decode_response(response)
            if not data.get('access_token'):
                raise RuntimeError('Token error: ' + json.dumps(data, ensure_ascii=False))
            token[0] = data['access_token']
        query = dict(params or {}, access_token=token[0])
        kwargs = {'params': query, 'timeout': 60}
        if files is not None:
            kwargs['files'] = files
        if body is not None:
            kwargs['data'] = json.dumps(body, ensure_ascii=False).encode('utf-8')
            kwargs['headers'] = {'Content-Type': 'application/json; charset=utf-8'}
        data = decode_response(requests.post('https://api.weixin.qq.com' + path, **kwargs))
        if data.get('errcode') not in (None, 0):
            raise RuntimeError('WeChat API error: ' + json.dumps(data, ensure_ascii=False))
        return data

    try:
        # Persistent empty lock only; secrets and token stay in process memory.
        with open('/tmp/ai-blog-wechat-draft.lock', 'a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            run(payload, request, report)
    except requests.RequestException as error:
        report({'error': type(error).__name__, 'message': 'Network failure; credential-bearing URL omitted. Inspect before retrying creation.'})
        return 2
    except Exception as error:
        report({'error': type(error).__name__, 'message': str(error)})
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
