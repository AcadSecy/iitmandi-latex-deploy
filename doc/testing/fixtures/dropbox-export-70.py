#!/usr/bin/env python3
"""Offline feasibility checks for exporting an immutable source ZIP."""

from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from pathlib import PurePosixPath
from unittest import TestCase, main
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


SOURCE_SUFFIXES = {'.tex', '.bib', '.bst', '.cls', '.sty', '.png', '.jpg', '.jpeg', '.eps'}


def select_source(files):
    selected = {}
    for file_id, (name, content) in files.items():
        path = PurePosixPath(name)
        if name.startswith('/') or '\\' in name or any(part.startswith('.') for part in name.split('/')):
            continue
        if path.suffix.lower() in SOURCE_SUFFIXES:
            selected[file_id] = (name, content)
    return selected


def changes(previous, current):
    return {
        'added': sorted(current[key][0] for key in current.keys() - previous.keys()),
        'deleted': sorted(previous[key][0] for key in previous.keys() - current.keys()),
        'renamed': sorted(
            (previous[key][0], current[key][0]) for key in previous.keys() & current.keys()
            if previous[key][0] != current[key][0]
        ),
    }


def bundle(files):
    output = BytesIO()
    with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
        for name, data in sorted(files.values()):
            archive.writestr(ZipInfo(name), data, compress_type=ZIP_DEFLATED)
    return output.getvalue()


def dropbox_hash(data):
    block_size = 4 * 1024 * 1024
    blocks = (data[offset:offset + block_size] for offset in range(0, len(data), block_size))
    return sha256(b''.join(sha256(block).digest() for block in blocks)).hexdigest()


class Conflict(Exception):
    pass


class RateLimited(Exception):
    def __init__(self, retry_after):
        self.retry_after = retry_after


class MockDropbox:
    def __init__(self):
        self.files = {}
        self.access = True
        self.rate_limit = False
        self.lose_response_once = False
        self.upload_count = 0

    def metadata(self, path):
        if not self.access:
            raise PermissionError('provider authorization has expired')
        return self.files.get(path)

    def create_only(self, path, data):
        if self.rate_limit:
            raise RateLimited(5)
        if self.metadata(path) is not None:
            raise Conflict('destination already exists')
        self.upload_count += 1
        self.files[path] = (f'rev-{self.upload_count}', dropbox_hash(data), data)
        if self.lose_response_once:
            self.lose_response_once = False
            raise ConnectionError('connection closed before receipt')
        return self.files[path][0]


@dataclass(frozen=True)
class ExportPreview:
    revision: int
    diff: dict
    path: str
    contents: bytes
    digest: str


class ExportTrial:
    def __init__(self, provider):
        self.provider = provider
        self.owner = 'owner'
        self.connected = True
        self.revision = 1
        self.files = {}
        self.previews = {}
        self.retry_at = {}

    def require_connection(self, user):
        if user != self.owner or not self.connected:
            raise PermissionError('only the connected project owner can export')

    def preview(self, user, previous):
        self.require_connection(user)
        current = select_source(self.files)
        data = bundle(current)
        path = f'/exports/{uuid4()}.zip'
        preview = ExportPreview(self.revision, changes(select_source(previous), current), path, data, dropbox_hash(data))
        self.previews[path] = preview
        return preview

    def confirm(self, user, preview, now):
        self.require_connection(user)
        if self.previews.get(preview.path) is not preview or preview.revision != self.revision:
            raise Conflict('review the current project before exporting')
        if now < self.retry_at.get(preview.path, 0):
            raise RateLimited(self.retry_at[preview.path] - now)
        existing = self.provider.metadata(preview.path)
        if existing:
            if existing[1] == preview.digest:
                return existing[0]
            raise Conflict('destination differs from the source preview')
        try:
            return self.provider.create_only(preview.path, preview.contents)
        except RateLimited as error:
            self.retry_at[preview.path] = now + error.retry_after
            raise

    def disconnect(self, user):
        self.require_connection(user)
        self.connected = False
        self.previews.clear()
        self.retry_at.clear()


class Acceptance(TestCase):
    def setUp(self):
        self.provider = MockDropbox()
        self.trial = ExportTrial(self.provider)
        self.trial.files = {'1': ('main.tex', b'New fixture')}

    def test_preview_add_rename_delete_and_source_only_archive(self):
        previous = {'1': ('draft.tex', b'Old fixture'), '2': ('removed.tex', b'Obsolete')}
        self.trial.files.update({
            '3': ('refs.bib', b'New references'), '4': ('main.pdf', b'Build output'),
            '5': ('.env', b'Fake secret'), '6': ('history/log.txt', b'Local history'),
            '7': ('../bad.tex', b'Outside the project'),
        })
        preview = self.trial.preview('owner', previous)
        self.assertEqual(preview.diff, {'added': ['refs.bib'], 'deleted': ['removed.tex'], 'renamed': [('draft.tex', 'main.tex')]})
        self.assertFalse(self.provider.files)
        self.trial.confirm('owner', preview, now=0)
        remote = self.provider.files[preview.path][2]
        with ZipFile(BytesIO(remote)) as archive:
            self.assertEqual(archive.namelist(), ['main.tex', 'refs.bib'])
        self.assertEqual(self.provider.upload_count, 1)

    def test_project_and_destination_conflicts_leave_files_unchanged(self):
        stale = self.trial.preview('owner', {})
        self.trial.files['1'] = ('main.tex', b'Newer work')
        self.trial.revision += 1
        with self.assertRaisesRegex(Conflict, 'current project'):
            self.trial.confirm('owner', stale, now=0)
        preview = self.trial.preview('owner', {})
        self.provider.files[preview.path] = ('newer-rev', dropbox_hash(b'newer remote'), b'newer remote')
        with self.assertRaisesRegex(Conflict, 'destination differs'):
            self.trial.confirm('owner', preview, now=0)
        self.assertEqual(self.provider.files[preview.path][2], b'newer remote')
        self.assertEqual(self.provider.upload_count, 0)

    def test_owner_only_and_revocation_on_every_operation(self):
        preview = self.trial.preview('owner', {})
        for user in ('editor', 'reader', 'unrelated', 'removed-editor'):
            for operation in (
                lambda: self.trial.preview(user, {}),
                lambda: self.trial.confirm(user, preview, now=0),
                lambda: self.trial.disconnect(user),
            ):
                with self.assertRaises(PermissionError):
                    operation()
        self.provider.access = False
        with self.assertRaisesRegex(PermissionError, 'provider authorization'):
            self.trial.confirm('owner', preview, now=0)
        self.trial.disconnect('owner')
        with self.assertRaises(PermissionError):
            self.trial.preview('owner', {})
        with self.assertRaises(PermissionError):
            self.trial.confirm('owner', preview, now=0)
        self.assertEqual(self.provider.upload_count, 0)

    def test_rate_limit_and_indeterminate_receipt_can_retry_without_duplicate(self):
        preview = self.trial.preview('owner', {})
        self.provider.rate_limit = True
        with self.assertRaises(RateLimited) as error:
            self.trial.confirm('owner', preview, now=0)
        self.assertEqual(error.exception.retry_after, 5)
        self.provider.rate_limit = False
        with self.assertRaises(RateLimited) as retry:
            self.trial.confirm('owner', preview, now=3)
        self.assertEqual(retry.exception.retry_after, 2)
        self.provider.lose_response_once = True
        with self.assertRaises(ConnectionError):
            self.trial.confirm('owner', preview, now=5)
        self.assertEqual(self.trial.confirm('owner', preview, now=6), 'rev-1')
        self.trial.disconnect('owner')
        self.assertEqual(self.provider.upload_count, 1)
        self.assertIn(preview.path, self.provider.files)
        self.assertIn('1', self.trial.files)


if __name__ == '__main__':
    main(verbosity=2)
