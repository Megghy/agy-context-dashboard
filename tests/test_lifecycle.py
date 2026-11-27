import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pulse_manager', ROOT / 'manage.py')
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)

class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.local = self.home / 'AppData' / 'Local'
        self.plugin = self.home / '.gemini' / 'config' / 'plugins' / 'antigravity-pulse'
        self.config = self.home / '.gemini' / 'config' / 'config.json'
        self.settings = self.local / 'AntigravityPulse' / 'settings.json'
        self.app = self.local / 'Programs' / 'antigravity' / 'resources' / 'app.asar'
        self.backups = self.local / 'AntigravityPulseBackups'
        self.context = patch.multiple(manager, HOME=self.home, LOCAL=self.local, PLUGIN=self.plugin,
                                      CONFIG=self.config, SETTINGS=self.settings, APP=self.app, BACKUPS=self.backups)
        self.context.start()
        self.addCleanup(self.context.stop)

    def test_panel_install_disable_enable_remove_preserves_other_settings(self):
        manager.atomic_json(self.config, {'other': {'keep': 1}, 'plugins': {'other-plugin': {'enabled': True}}})
        manager.install(panel_only=True)
        self.assertTrue((self.plugin / 'sidecars' / 'panel' / 'main.mjs').exists())
        manager.set_enabled(False)
        self.assertFalse(manager.json_read(self.settings)['enabled'])
        manager.set_enabled(True)
        self.assertTrue(manager.json_read(self.settings)['enabled'])
        manager.uninstall()
        self.assertFalse(self.plugin.exists())
        self.assertFalse(manager.json_read(self.settings)['enabled'])
        config = manager.json_read(self.config)
        self.assertEqual(config['other'], {'keep': 1})
        self.assertTrue(config['plugins']['other-plugin']['enabled'])

    def test_app_lifecycle_respects_active_update_and_recovery_journal(self):
        lock_spec=importlib.util.spec_from_file_location('test_update_lock', ROOT/'compat/update-lock.py')
        locks=importlib.util.module_from_spec(lock_spec);lock_spec.loader.exec_module(locks)
        with locks.lifecycle_lock(self.plugin):
            with self.assertRaises(FileExistsError):manager.install(panel_only=True)
            self.assertFalse((self.plugin / 'sidecars' / 'panel' / 'main.mjs').exists())
            with self.assertRaises(FileExistsError):manager.uninstall()
        journal=self.plugin.parent/'.antigravity-pulse-update-transaction/journal.json'
        journal.parent.mkdir();journal.write_text('{}')
        with self.assertRaisesRegex(RuntimeError,'recovery'):manager.install(panel_only=True)
        self.assertFalse((self.plugin / 'sidecars' / 'panel' / 'main.mjs').exists())
        with self.assertRaisesRegex(RuntimeError,'recovery'):manager.uninstall()

    def test_other_plugin_is_not_overwritten_or_removed(self):
        self.plugin.mkdir(parents=True)
        manager.atomic_json(self.plugin / 'plugin.json', {'name': 'different'})
        with self.assertRaises(RuntimeError): manager.install(panel_only=True)
        with self.assertRaises(RuntimeError): manager.uninstall()
        self.assertEqual(manager.json_read(self.plugin / 'plugin.json')['name'], 'different')

    def test_uninstall_restores_only_the_exact_verified_archive(self):
        self.plugin.mkdir(parents=True)
        manager.atomic_json(self.plugin / 'plugin.json', {'name': 'antigravity-pulse'})
        self.app.parent.mkdir(parents=True)
        self.app.write_bytes(b'patched-fixture')
        backup = self.backups / 'test-backup'
        backup.mkdir(parents=True)
        (backup / 'app.asar').write_bytes(b'original-fixture')
        manager.atomic_json(backup / 'patch.json', {'patchedSha256': hashlib.sha256(b'patched-fixture').hexdigest(),
                                                  'originalSha256': hashlib.sha256(b'original-fixture').hexdigest()})
        manager.uninstall()
        self.assertEqual(self.app.read_bytes(), b'original-fixture')
        self.assertTrue(backup.exists())

    def test_unknown_app_changes_block_uninstall_before_deleting_plugin(self):
        self.plugin.mkdir(parents=True)
        manager.atomic_json(self.plugin / 'plugin.json', {'name': 'antigravity-pulse'})
        self.app.parent.mkdir(parents=True)
        changed = b'changed-by-another-application // AG_PULSE_INLINE_V1'
        self.app.write_bytes(changed)
        with self.assertRaises(Exception): manager.uninstall()
        self.assertTrue(self.plugin.exists())
        self.assertEqual(self.app.read_bytes(), changed)

    def test_default_install_and_upgrade_do_not_modify_the_application(self):
        self.app.parent.mkdir(parents=True)
        for archive in [b'future-host-build-without-legacy-patch', b'newer-host-build-after-auto-update']:
            self.app.write_bytes(archive)
            manager.install()
            self.assertEqual(self.app.read_bytes(), archive)
            self.assertEqual(manager.json_read(self.settings)['mode'], 'runtime')
            self.assertTrue(manager.json_read(self.settings)['inline'])
        self.assertTrue((self.plugin / 'compat' / 'runtime-ui.mjs').is_file())

    def test_switches_preserve_runtime_settings(self):
        manager.install(panel_only=True)
        manager.atomic_json(self.settings, {'enabled': True, 'inline': False, 'mode': 'runtime', 'custom': 123})
        manager.set_enabled(False)
        manager.set_enabled(True)
        self.assertEqual(manager.json_read(self.settings), {'enabled': True, 'inline': False, 'mode': 'runtime', 'custom': 123})

    def test_default_migration_refuses_unknown_legacy_edits_before_copying(self):
        self.app.parent.mkdir(parents=True)
        self.app.write_bytes(b'unknown-modifications // AG_PULSE_INLINE_V1')
        with self.assertRaises(RuntimeError): manager.install()
        self.assertFalse(self.plugin.exists())
        self.assertEqual(self.app.read_bytes(), b'unknown-modifications // AG_PULSE_INLINE_V1')

    def test_release_uses_allowlist_and_excludes_private_runtime_files(self):
        output = self.home / 'release.zip'
        manager.package(output)
        with zipfile.ZipFile(output) as bundle:
            names = bundle.namelist()
            self.assertIn('antigrative-dashboard/manage.py', names)
            self.assertIn('antigrative-dashboard/LICENSE', names)
            self.assertFalse(any(name.endswith(('.log', '.asar', '.pyc')) for name in names))
            self.assertFalse(any('/.git/' in name or '/__pycache__/' in name for name in names))
        self.assertTrue(output.with_suffix('.zip.sha256').exists())

    def test_history_and_sdk_records_are_excluded_even_if_inside_source(self):
        source = self.home / 'fixture-source'
        manager.atomic_json(source / 'plugin.json', {'version': 'test'})
        panel = source / 'sidecars' / 'panel'
        panel.mkdir(parents=True)
        (panel / 'main.mjs').write_text('// public runtime')
        manager.atomic_json(panel / 'data' / 'history-v1' / 'account' / 'conversation.json', {'private': 'statistics'})
        manager.atomic_json(panel / 'sdk' / 'private.json', {'private': 'host SDK'})
        output = self.home / 'private-exclusion.zip'
        with patch.multiple(manager, SOURCE=source, DIST_FILES=('plugin.json', 'sidecars')):
            manager.package(output)
        with zipfile.ZipFile(output) as bundle:
            self.assertEqual(set(bundle.namelist()), {'antigrative-dashboard/plugin.json', 'antigrative-dashboard/sidecars/panel/main.mjs'})

    def test_desktop_install_keeps_cli_decoupled_and_syncs_when_with_cli_is_requested(self):
        cli_mod = manager.cli_lifecycle()
        expected = cli_mod.source_version(ROOT)
        home = self.home.resolve()
        with patch.object(manager, 'HOME', home):
            cli_mod.install(ROOT, home)
            _, _, cli_root, _ = cli_mod.paths(home)
            cli_mod.write(cli_root / 'installation.json', {'name': cli_mod.NAME, 'schema': 1, 'version': '0.8.12'})
            statusline = cli_root / 'cli' / 'statusline.mjs'
            statusline.write_text('// stale-sentinel\n', encoding='utf-8')

            manager.atomic_json(self.config, {'plugins': {}})
            output = io.StringIO()
            with patch('sys.stdout', output):
                manager.install(panel_only=True)
            self.assertIn('0.8.12', output.getvalue())
            self.assertIn('install-cli', output.getvalue())
            self.assertIn('--with-cli', output.getvalue())
            self.assertEqual(statusline.read_text(encoding='utf-8'), '// stale-sentinel\n')

            status_out = io.StringIO()
            with patch('sys.stdout', status_out):
                manager.status()
            parsed_status = json.loads(status_out.getvalue())
            self.assertTrue(parsed_status['cli']['installed'])
            self.assertTrue(parsed_status['cli']['stale'])

            manager.install(panel_only=True, with_cli=True)
            self.assertNotEqual(statusline.read_text(encoding='utf-8'), '// stale-sentinel\n')
            self.assertEqual(cli_mod.read(cli_root / 'installation.json')['version'], expected)
            self.assertFalse(cli_mod.inspect_status(home, ROOT)['stale'])

    def test_status_reports_debug_port_and_launcher_diagnostics(self):
        manager.install(panel_only=True)
        out = io.StringIO()
        with patch('sys.stdout', out):
            manager.status()
        parsed = json.loads(out.getvalue())
        self.assertFalse(parsed['debugPortAvailable'])
        self.assertFalse(parsed['launcher']['installed'])
        self.assertIn('debugPortHint', parsed)
        self.assertIn('--remote-debugging-port=0 --remote-debugging-address=127.0.0.1', parsed['debugPortHint'])
        profile = manager._current_profile()
        profile.mkdir(parents=True, exist_ok=True)
        (profile / 'DevToolsActivePort').write_text('9222\n/devtools/browser/1\n', encoding='utf-8')
        out_ready = io.StringIO()
        with patch('sys.stdout', out_ready):
            manager.status()
        parsed_ready = json.loads(out_ready.getvalue())
        self.assertTrue(parsed_ready['debugPortAvailable'])
        self.assertNotIn('debugPortHint', parsed_ready)

    def test_install_restarts_verified_active_sidecar_from_sidecar_data(self):
        manager.atomic_json(self.config, {'plugins': {}})
        marker = self.home / '.gemini' / 'antigravity' / 'sidecar_data' / 'antigravity-pulse' / 'panel' / 'data' / 'active-sidecar.json'
        manager.atomic_json(marker, {'pid': 424242, 'startedAt': 1, 'token': 'tok'})
        out = io.StringIO()
        with patch.object(manager, '_is_sidecar_process', return_value=True), \
             patch.object(manager.os, 'kill') as kill_mock, \
             patch('sys.stdout', out):
            manager.install(panel_only=True)
        kill_mock.assert_called_once_with(424242, manager.signal.SIGTERM)
        self.assertIn('Restarted active plugin sidecar', out.getvalue())

        with patch.object(manager, '_is_sidecar_process', return_value=False), \
             patch.object(manager.os, 'kill') as kill_mock, \
             patch('sys.stdout', io.StringIO()):
            manager.install(panel_only=True)
        kill_mock.assert_not_called()

if __name__ == '__main__': unittest.main()
