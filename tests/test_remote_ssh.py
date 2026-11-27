import json
from pathlib import Path
import tempfile
import unittest

import manage


class RemoteSshCliTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.orig_settings = manage.SETTINGS
        manage.SETTINGS = self.root / 'settings.json'

    def tearDown(self):
        manage.SETTINGS = self.orig_settings
        self.temp.cleanup()

    def test_set_remote_bridge_enables_and_disables_cleanly(self):
        self.assertEqual(manage.set_remote_bridge(17891), 17891)
        saved = json.loads(manage.SETTINGS.read_text(encoding='utf-8'))
        self.assertEqual(saved['remoteBridgePort'], 17891)

        with self.assertRaises(ValueError):
            manage.set_remote_bridge(80)
        with self.assertRaises(ValueError):
            manage.set_remote_bridge(70000)

        self.assertIsNone(manage.set_remote_bridge(None))
        saved = json.loads(manage.SETTINGS.read_text(encoding='utf-8'))
        self.assertNotIn('remoteBridgePort', saved)

    def test_remote_endpoint_crud_and_loopback_validation(self):
        host, endpoint = manage.set_remote_endpoint('SSH: dev@198.51.100.10', '17891')
        self.assertEqual(host, 'dev@198.51.100.10')
        self.assertEqual(endpoint, 'http://127.0.0.1:17891')

        host2, endpoint2 = manage.set_remote_endpoint('*', 'http://localhost:17892/')
        self.assertEqual(host2, '*')
        self.assertEqual(endpoint2, 'http://127.0.0.1:17892')

        saved = json.loads(manage.SETTINGS.read_text(encoding='utf-8'))
        self.assertEqual(saved['remoteEndpoints'], {
            'dev@198.51.100.10': 'http://127.0.0.1:17891',
            '*': 'http://127.0.0.1:17892',
        })

        for bad in ('http://198.51.100.10:17891', 'https://127.0.0.1:17891', 'http://example.com:17891', 'http://127.0.0.1:17891/path'):
            with self.assertRaises(ValueError):
                manage.set_remote_endpoint('dev@198.51.100.10', bad)

        with self.assertRaises(ValueError):
            manage.set_remote_endpoint('bad host with spaces', '17891')

        self.assertTrue(manage.remove_remote_endpoint('SSH: DEV@198.51.100.10'))
        self.assertFalse(manage.remove_remote_endpoint('dev@198.51.100.10'))
        self.assertTrue(manage.remove_remote_endpoint('*'))
        saved = json.loads(manage.SETTINGS.read_text(encoding='utf-8'))
        self.assertNotIn('remoteEndpoints', saved)


if __name__ == '__main__':
    unittest.main()
