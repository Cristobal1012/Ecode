"""Safety checks run without connecting to any application database."""
import os
from pathlib import Path
import runpy
from types import ModuleType
import unittest
from unittest.mock import patch

from tools.qa.scrum177.prepare import targets, validate_command


class IsolationTests(unittest.TestCase):
    def test_missing_invalid_or_long_run_id_is_rejected(self):
        for value in ('', '../habitual', 'real-db', 'A', 'x' * 25, 'run;drop', 'run\n'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                targets({'QA177_RUN_ID': value})

    def test_destinations_are_derived_and_cannot_fall_back_to_normal_environment(self):
        destination = targets({'QA177_RUN_ID': 'revision_01', 'POSTGRES_DB': 'habitual',
                               'MONGO_URI': 'mongodb://habitual/real'})
        self.assertEqual(destination['name'], 'ecode_qa_scrum177_revision_01')
        self.assertEqual(destination['test_name'], 'test_ecode_qa_scrum177_revision_01')
        self.assertNotIn('venv', str(destination['root']))

    def test_settings_and_pythonpath_overrides_are_rejected(self):
        for arguments in (['test', '--settings', 'backend_project.settings'],
                          ['check', '--settings=backend_project.settings'],
                          ['--pythonpath=C:/other', 'migrate']):
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                validate_command(arguments)

    def test_standard_commands_are_available(self):
        for command in ('check', 'test', 'migrate', 'shell', 'runserver'):
            validate_command([command])

    def test_qa_settings_neutralize_credentials_before_historical_migrations(self):
        # Stub only base settings: no Django initialization or database connection is needed.
        base = ModuleType('backend_project.settings')
        base.DATABASES = {'default': {}}
        names = ('RESEND_API_KEY', 'EMAIL_HOST', 'CHILEXPRESS_API_KEY_COTIZADOR',
                 'CHILEXPRESS_API_KEY_COBERTURAS', 'CHILEXPRESS_API_KEY_GEO',
                 'CHILEXPRESS_API_KEY_ENVIOS', 'TRANSBANK_WEBPAY_COMMERCE_CODE',
                 'TRANSBANK_WEBPAY_API_KEY')
        with patch.dict(os.environ, {**{name: 'value-must-not-be-imported' for name in names},
                                     'QA177_RUN_ID': 'settings_guard', 'POSTGRES_DB': 'habitual'}), \
                patch.dict('sys.modules', {'backend_project.settings': base}):
            result = runpy.run_path(str(Path(__file__).with_name('qa_settings.py')))
            self.assertTrue(all(os.environ[name] == '' for name in names))
            self.assertEqual(os.environ['POSTGRES_DB'], 'ecode_qa_scrum177_settings_guard')
            self.assertEqual(os.environ['TRANSBANK_ENVIRONMENT'], 'INTEGRACION')
            self.assertEqual(result['MAILERS']['default']['BACKEND'],
                             'django.core.mail.backends.filebased.EmailBackend')


if __name__ == '__main__':
    unittest.main()
