"""Safety checks run without connecting to any application database."""
import unittest

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


if __name__ == '__main__':
    unittest.main()
