"""Run Django commands against the isolated SCRUM-177 environment."""
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from tools.qa.scrum177.prepare import targets, validate_command

targets()
validate_command(sys.argv[1:])
os.environ['DJANGO_SETTINGS_MODULE'] = 'tools.qa.scrum177.qa_settings'

from django.core.management import execute_from_command_line

if __name__ == '__main__':
    execute_from_command_line(sys.argv)
