import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import types
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('deploy.py')
spec = importlib.util.spec_from_file_location('latex_deploy', SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
SHA = 'a' * 40
BASE = 'ghcr.io/acadsecy/iitmandi-latex-server-base@sha256:' + 'c' * 64

class DeploymentSafety(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.compose = self.root / 'compose'
        self.compose.mkdir()
        (self.compose / '.env').write_text('LATEX_IMAGE=old-image\nLATEX_PORT=8080\n')
        (self.compose / 'secrets.env').write_text('invitation-secret-that-must-survive\n')
        (self.compose / 'docker-compose.yml').write_text('old configuration\n')
        self.calls = []
        self.arch = 'amd64'
        self.revision = SHA
        self.patches = [patch.object(m, 'ROOT', self.root), patch.object(m, 'COMPOSE', self.compose),
                        patch.object(m, 'STATE', self.root/'deploy'), patch.object(m, 'run', self.fake_run),
                        patch.object(m.subprocess, 'run', return_value=types.SimpleNamespace(returncode=0, stdout='sha256:oldbase\n')),
                        patch.object(m.shutil, 'disk_usage', return_value=types.SimpleNamespace(free=100*1024**3))]
        for p in self.patches: p.start()
    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.tmp.cleanup()
    def fake_run(self, *args, **kwargs):
        self.calls.append(args)
        if args[:3] == ('docker', 'image', 'inspect'):
            return json.dumps([{'Architecture':self.arch, 'Config':{'Labels':{
                'com.overleaf.ce.revision':self.revision, 'org.iitmandi.compile-image':BASE}}}])
        if args[:2] == ('git', 'init'):
            checkout = Path(args[-1]); checkout.mkdir()
            shutil.copytree(SCRIPT.parent, checkout/'deploy/server', ignore=shutil.ignore_patterns('__pycache__'))
        return ''
    def test_wrong_revision_does_not_touch_config_or_start_containers(self):
        self.revision = 'b'*40
        with patch.object(m, 'compose') as activation:
            with self.assertRaisesRegex(RuntimeError, 'source revision'):
                m.deploy(SHA)
            activation.assert_not_called()
        self.assertEqual((self.compose/'.env').read_text(), 'LATEX_IMAGE=old-image\nLATEX_PORT=8080\n')
    def test_failed_start_restores_config_compile_alias_and_keeps_secrets(self):
        calls=[]
        def activate(*args):
            calls.append(args)
            if len(calls)==2: raise RuntimeError('simulated failed app start')
        with patch.object(m, 'compose', side_effect=activate), patch.object(m, 'wait_ready') as ready:
            with self.assertRaisesRegex(RuntimeError, 'simulated failed'):
                m.deploy(SHA)
            ready.assert_called_once_with('old-image')
        self.assertEqual((self.compose/'docker-compose.yml').read_text(), 'old configuration\n')
        self.assertEqual((self.compose/'secrets.env').read_text(), 'invitation-secret-that-must-survive\n')
        self.assertEqual(m.env(self.compose/'.env')['LATEX_IMAGE'], 'old-image')
        self.assertIn(('docker','tag','sha256:oldbase','iitmandi/texlive-pi:2026.1'), self.calls)
        self.assertFalse((m.STATE/'deployed-commit').exists())
    def test_success_keeps_secrets_and_records_exact_commit(self):
        with patch.object(m, 'compose'), patch.object(m, 'wait_ready') as ready:
            m.deploy(SHA)
            ready.assert_called_once_with(m.IMAGE+':'+SHA)
        self.assertEqual((self.compose/'secrets.env').read_text(), 'invitation-secret-that-must-survive\n')
        self.assertEqual((m.STATE/'deployed-commit').read_text().strip(), SHA)
        self.assertEqual(m.env(self.compose/'.env')['LATEX_IMAGE'], m.IMAGE+':'+SHA)

if __name__ == '__main__':
    unittest.main(verbosity=2)
