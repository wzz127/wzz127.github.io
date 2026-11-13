#!/usr/bin/env python3
"""Prepare a blog article locally, then create/inspect/verify a draft over SSH."""
import argparse
import base64
import json
import mimetypes
import shlex
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
SERVER = 'root@47.93.233.128'
PREPARE = r'''
const fs=require('fs'), path=require('path');
const fm=require('hexo-front-matter'), {marked}=require('marked'), cheerio=require('cheerio');
const root=process.cwd(), post=process.argv[1], override=process.argv[2];
const raw=fs.readFileSync(post,'utf8'), meta=fm.parse(raw), slug=path.basename(post,'.md');
const base=String(fm.parse('---\n'+fs.readFileSync('_config.yml','utf8')+'\n---\n').url).replace(/\/$/,'');
const date=raw.match(/^date:\s*["']?(\d{4})-(\d{2})-(\d{2})/m);
if(!date || !meta.title || !meta.cover) throw Error('Post needs title, date and cover');
const original=marked.parse(meta._content), prepared=override || path.join(root,'wechat-drafts',slug+'.html');
let doc=cheerio.load(fs.existsSync(prepared)?fs.readFileSync(prepared,'utf8'):original,{},false);
if(doc('article').length) doc=cheerio.load(doc('article').html(),{},false);
else if(doc('html,body,head').length) throw Error('Prepared full page must contain <article>');
if(doc('script,iframe,style,form,object,embed,video,audio').length) throw Error('Unsupported active/media content');
doc('*').each((_,el)=>{for(const k of Object.keys(el.attribs||{})) if(/^on/i.test(k)) throw Error('Event handlers not allowed');});
const norm=s=>s.replace(/\s+/g,'');
const src=cheerio.load(original,{},false);
if(norm(doc.root().text())!==norm(src.root().text())) throw Error('Prepared article text differs from source Markdown');
const canonical=s=>new URL(s,base).href;
const images=doc('img').map((_,el)=>doc(el).attr('src')).get();
const sourceImages=src('img').map((_,el)=>src(el).attr('src')).get();
if(JSON.stringify(images.map(canonical))!==JSON.stringify(sourceImages.map(canonical))) throw Error('Prepared article images differ from source Markdown');
doc('p').each((_,el)=>{if(!doc(el).attr('style'))doc(el).attr('style','margin:0 0 20px;font-size:16px;line-height:1.9;color:#333;');});
doc('img').attr('style','display:block;max-width:100%;height:auto;');
console.log(JSON.stringify({title:meta.title,author:meta.author||'k_fad',digest:String(meta.description||'').slice(0,120),
 article:doc.html(),images,cover:meta.cover,base,source_url:base+'/'+date.slice(1).join('/')+'/'+encodeURIComponent(slug)+'/',slug}));
'''


def prepare(post, html_file=None):
    result = subprocess.run(['node', '-e', PREPARE, str(post), str(html_file) if html_file else ''],
                            cwd=str(ROOT), text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    data = json.loads(result.stdout)
    assets = {}
    def asset(source):
        parsed = urlparse(source)
        if parsed.scheme and (parsed.scheme not in ('https', 'http') or parsed.netloc != urlparse(data['base']).netloc):
            raise RuntimeError('Use a reviewed local image instead of an external image: ' + source)
        path = (ROOT / 'source' / unquote(parsed.path).lstrip('/')).resolve()
        path.relative_to((ROOT / 'source').resolve())
        if path.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.gif') or not path.is_file():
            raise RuntimeError('Missing or unsupported image: ' + str(path))
        key = str(path.relative_to(ROOT))
        if key not in assets:
            assets[key] = {'key': key, 'name': path.name, 'mime': mimetypes.guess_type(path.name)[0],
                           'sources': [], 'path': str(path)}
        return assets[key]
    data['cover_key'] = asset(data.pop('cover'))['key']
    images = data.pop('images')
    for source in images:
        asset(source)['sources'].append(source)
    data['image_count'] = len(images)
    data['assets'] = list(assets.values())
    return data


def credentials(path):
    result = {}
    for raw in path.read_text().splitlines():
        if '=' not in raw or raw.lstrip().startswith('#'):
            continue
        key, value = raw.split('=', 1)
        if key.strip() in ('WECHAT_MP_APPID', 'WECHAT_MP_SECRET'):
            result[key.strip()] = value.strip().strip('"').strip("'")
    if not all(result.get(k) for k in ('WECHAT_MP_APPID', 'WECHAT_MP_SECRET')):
        raise RuntimeError('Missing WeChat credentials in ' + str(path))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('prepare', 'inspect', 'create', 'verify'))
    parser.add_argument('--post', required=True, type=Path)
    parser.add_argument('--html', type=Path, help='Optional reviewed HTML with an <article> wrapper')
    parser.add_argument('--ssh-key', type=Path, default=Path.home() / 'Downloads/codex.pem')
    parser.add_argument('--env-file', type=Path, default=Path.home() / '.hermes/.env')
    args = parser.parse_args()
    data = prepare(args.post.resolve(), args.html.resolve() if args.html else None)
    receipt = ROOT / 'wechat-drafts' / (data['slug'] + '-api-receipt.json')
    data['mode'] = args.mode
    if args.mode == 'prepare':
        print(json.dumps({'title': data['title'], 'source_url': data['source_url'],
                          'body_images': data['image_count'], 'assets': [a['key'] for a in data['assets']],
                          'server': SERVER, 'mode': 'local_only'}, ensure_ascii=False, indent=2))
        return 0
    # A saved ID always takes precedence over title search on repeated creation attempts.
    if args.mode == 'verify' or (args.mode == 'create' and receipt.exists()):
        data['media_id'] = json.loads(receipt.read_text())['draft_media_id']
        data['mode'] = 'verify'
    for item in data['assets']:
        path = Path(item.pop('path'))
        if data['mode'] == 'create':
            item['data'] = base64.b64encode(path.read_bytes()).decode('ascii')
    data['credentials'] = credentials(args.env_file.expanduser())
    worker = (ROOT / 'tooling/wechat-draft-worker.py').read_text()
    command = ['ssh', '-i', str(args.ssh_key.expanduser()), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
               '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', SERVER,
               'python3 -c ' + shlex.quote(worker)]
    try:
        result = subprocess.run(command, input=json.dumps(data), text=True, capture_output=True, timeout=240)
        output, error, code = result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired as exc:
        output = exc.stdout or b''
        if isinstance(output, bytes):
            output = output.decode('utf-8', errors='replace')
        error, code = 'SSH timeout; inspect draft box before retrying creation.\n', 2
    for line in output.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if event.get('stage') in ('created', 'verified'):
            receipt.parent.mkdir(exist_ok=True)
            temp = receipt.with_suffix('.json.tmp')
            temp.write_text(json.dumps(event, ensure_ascii=False, indent=2) + '\n')
            temp.replace(receipt)
    print(output, end='')
    print(error, end='', file=sys.stderr)
    return code


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
