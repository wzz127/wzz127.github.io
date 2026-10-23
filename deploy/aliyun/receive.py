#!/usr/bin/python3
"""Root-owned forced SSH command; runs as blog-deploy with no sudo/Docker access."""
import fcntl
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tarfile
import time
import urllib.request
import uuid

BASE = Path('/opt/ai-blog/site')


def extract(data, destination):
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        total = 0
        count = 0
        for item in archive:
            count += 1
            total += item.size
            path = PurePosixPath(item.name)
            if (count > 5000 or total > 100 * 1024 * 1024 or path.is_absolute()
                    or '..' in path.parts or not (item.isdir() or item.isfile())):
                raise ValueError('Unsafe or oversized publication archive')
            target = destination.joinpath(*path.parts)
            if item.isdir():
                target.mkdir(parents=True, exist_ok=True)
                target.chmod(0o755)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(item) as source, target.open('wb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o644)


def read_json(url):
    with urllib.request.urlopen(url, timeout=12) as response:
        return json.load(response)


def switch(target):
    temporary = BASE / ('switch-' + uuid.uuid4().hex)
    temporary.symlink_to(target)
    os.replace(str(temporary), str(BASE / 'current'))


def publish(sha, data):
    # Same-user concurrent releases are serialized even outside GitHub Actions.
    with (BASE / '.publish.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous = os.readlink(str(BASE / 'current'))
        health_before = read_json('https://47.93.233.128/healthz')
        if not health_before.get('ok'):
            raise RuntimeError('sanxing is unhealthy before publication')
        release = 'ci-' + time.strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:8]
        destination = BASE / 'releases' / release
        destination.mkdir(mode=0o755)
        activated = False
        try:
            extract(data, destination)
            metadata = json.loads((destination / 'deployment.json').read_text())
            if metadata['sourceCommit'] != sha or not (destination / 'index.html').is_file():
                raise ValueError('Missing index or wrong commit')
            switch('releases/' + release)
            activated = True
            for url in ['http://127.0.0.1:18080/deployment.json',
                        'https://blog.kfad127.xyz/deployment.json']:
                if read_json(url)['sourceCommit'] != sha:
                    raise RuntimeError('Publication verification failed')
            with urllib.request.urlopen('https://blog.kfad127.xyz/', timeout=12) as response:
                if response.status != 200:
                    raise RuntimeError('Blog homepage unavailable')
            if read_json('https://47.93.233.128/healthz') != health_before:
                raise RuntimeError('sanxing health changed during publication')
            print(json.dumps({'published': sha, 'release': release, 'previous': previous}))
        except BaseException:
            if activated:
                switch(previous)
            # Only remove this invocation's newly created failed release.
            shutil.rmtree(str(destination))
            raise


def main():
    match = re.fullmatch(r'publish ([0-9a-f]{40})', os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    if not match:
        raise ValueError('Only publish <commit> is allowed')
    data = sys.stdin.buffer.read(32 * 1024 * 1024 + 1)
    if len(data) > 32 * 1024 * 1024:
        raise ValueError('Compressed publication exceeds limit')
    publish(match.group(1), data)


if __name__ == '__main__':
    main()
