import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).with_name('receive.py'))
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)


def archive(entries):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w:gz') as tar:
        for name, content in entries:
            item = tarfile.TarInfo(name)
            item.size = len(content)
            tar.addfile(item, io.BytesIO(content))
    return out.getvalue()


class ReceiverTests(unittest.TestCase):
    def test_rejects_escape_and_symlinks(self):
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaises(ValueError):
                receiver.extract(archive([('../escaped', b'x')]), Path(root))
            out = io.BytesIO()
            with tarfile.open(fileobj=out, mode='w:gz') as tar:
                item = tarfile.TarInfo('link')
                item.type = tarfile.SYMTYPE
                item.linkname = '/etc/passwd'
                tar.addfile(item)
            with self.assertRaises(ValueError):
                receiver.extract(out.getvalue(), Path(root))

    def test_post_switch_failure_restores_previous_site(self):
        with tempfile.TemporaryDirectory() as root:
            base = Path(root)
            (base / 'releases/old').mkdir(parents=True)
            (base / 'current').symlink_to('releases/old')
            sha = 'a' * 40
            data = archive([('index.html', b'new site'), ('deployment.json', json.dumps({'sourceCommit': sha}).encode())])
            with patch.object(receiver, 'BASE', base), patch.object(receiver, 'read_json', side_effect=[{'ok': True}, {'sourceCommit': sha}, RuntimeError('HTTPS failed')]):
                with self.assertRaises(RuntimeError):
                    receiver.publish(sha, data)
            self.assertEqual((base / 'current').readlink(), Path('releases/old'))
            self.assertEqual([p.name for p in (base / 'releases').iterdir()], ['old'])


if __name__ == '__main__':
    unittest.main()
