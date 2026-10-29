import importlib.util
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('backup',Path(__file__).with_name('backup.py'))
b=importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

class SnapshotSafety(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        root=Path(self.tmp.name)
        (root/'deploy').mkdir()
        (root/'compose').mkdir()
        (root/'compose/secrets.env').write_text('private-config')
        self.calls=[]
        self.patches=[patch.object(b,'ROOT',root),patch.object(b,'STORE',root/'backups'),
            patch.object(b.shutil,'disk_usage',return_value=types.SimpleNamespace(free=100*1024**3)),
            patch.object(b.sp,'check_output',return_value='tested-image\n'),
            patch.object(b.sp,'Popen',return_value=types.SimpleNamespace(pid=12345,poll=lambda:None)),
            patch.object(b.os,'killpg'),
            patch.object(b,'run',side_effect=lambda *a,**k:self.calls.append(a))]
        for p in self.patches:p.start()
    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        self.tmp.cleanup()
    def test_capture_failure_resumes_app_and_never_publishes_success(self):
        with patch.object(b,'capture',side_effect=RuntimeError('simulated dump failure')):
            with self.assertRaisesRegex(RuntimeError,'simulated'):
                b.main()
        self.assertIn(('docker','pause',b.APP),self.calls)
        self.assertIn(('docker','unpause',b.APP),self.calls)
        self.assertFalse((b.STORE/'last-success.json').exists())
        self.assertFalse(list(b.STORE.glob('*/manifest.json')))
    def test_success_includes_redis_and_config_without_copying_live_mongo_files(self):
        commands=[]
        def capture(path,*cmd):
            commands.append(cmd)
            path.write_bytes(b'backup-bytes')
        with patch.object(b,'capture',side_effect=capture):
            b.main()
        self.assertTrue((b.STORE/'last-success.json').exists())
        self.assertTrue(any('/data/dump.rdb' in cmd for cmd in commands))
        dump=next(cmd for cmd in commands if 'mongodump' in cmd)
        self.assertIn('--oplog',dump)
        self.assertIn(('docker','unpause',b.APP),self.calls)

if __name__=='__main__':unittest.main()
