import importlib.util
import hashlib
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('backup',Path(__file__).with_name('backup.py'))
b=importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

restore_spec = importlib.util.spec_from_file_location(
    'verify_backup', Path(__file__).with_name('verify-backup.py')
)
restore = importlib.util.module_from_spec(restore_spec)
restore_spec.loader.exec_module(restore)

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
    def test_hashes_work_on_python_310_and_detect_changes(self):
        sample = Path(self.tmp.name)/'example.bin'
        payload = b'abcd' * (1024 * 300 + 7)
        sample.write_bytes(payload)
        expected = hashlib.sha256(payload).hexdigest()
        self.assertEqual(b.sha256_file(sample), expected)
        self.assertEqual(restore.sha256_file(sample), expected)
        sample.write_bytes(payload + b'corrupted')
        self.assertNotEqual(b.sha256_file(sample), expected)
        self.assertNotEqual(restore.sha256_file(sample), expected)

    def test_capture_failure_resumes_app_and_never_publishes_success(self):
        with patch.object(b,'capture',side_effect=RuntimeError('simulated dump failure')):
            with self.assertRaisesRegex(RuntimeError,'simulated'):
                b.main()
        self.assertIn(('docker','pause',b.APP),self.calls)
        self.assertIn(('docker','unpause',b.APP),self.calls)
        self.assertFalse((b.STORE/'last-success.json').exists())
        self.assertFalse(list(b.STORE.glob('*/manifest.json')))
    def test_failed_unpause_does_not_disarm_independent_watchdog(self):
        # A transient Docker failure must not cancel the only remaining
        # safeguard against leaving the live application paused.
        def fail_unpause(*args, **kwargs):
            self.calls.append(args)
            if args == ('docker', 'unpause', b.APP):
                raise RuntimeError('simulated Docker unpause failure')
        with patch.object(b, 'run', side_effect=fail_unpause):
            with patch.object(b, 'capture', side_effect=RuntimeError('simulated dump failure')):
                with self.assertRaisesRegex(RuntimeError, 'unpause failure'):
                    b.main()
        self.assertIn(('docker', 'pause', b.APP), self.calls)
        self.assertIn(('docker', 'unpause', b.APP), self.calls)
        b.os.killpg.assert_not_called()
        self.assertFalse((b.STORE/'last-success.json').exists())

    def test_failed_pause_still_attempts_unpause(self):
        # Docker can time out after actually pausing the container.
        def fail_pause(*args, **kwargs):
            self.calls.append(args)
            if args == ('docker', 'pause', b.APP):
                raise RuntimeError('simulated pause timeout')
        with patch.object(b, 'run', side_effect=fail_pause):
            with self.assertRaisesRegex(RuntimeError, 'pause timeout'):
                b.main()
        self.assertIn(('docker', 'unpause', b.APP), self.calls)
        b.os.killpg.assert_called_once()
        self.assertFalse((b.STORE/'last-success.json').exists())

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
