"""Create a fresh SCRUM-177 database on the existing local QA services."""
import json
import os
from pathlib import Path
import re
import tempfile


def targets(environ=None):
    environ = os.environ if environ is None else environ
    run_id = environ.get('QA177_RUN_ID', '')
    if not re.fullmatch(r'[a-z0-9_]{1,24}', run_id):
        raise ValueError('Define QA177_RUN_ID: 1-24 lowercase letters, digits or underscores.')
    name = 'ecode_qa_scrum177_' + run_id
    return {
        'name': name,
        'test_name': 'test_' + name,
        'root': Path(tempfile.gettempdir()) / 'ecode-qa-scrum177' / run_id,
    }


def validate_command(arguments):
    if any(arg.split('=', 1)[0] in ('--settings', '--pythonpath') for arg in arguments):
        raise ValueError('This QA runner does not accept settings or pythonpath overrides.')


def prepare():
    import psycopg2
    from psycopg2 import sql
    from pymongo import MongoClient

    destination = targets()
    # These are the disposable local service credentials in scrum149/compose.yml.
    with MongoClient('mongodb://127.0.0.1:27049/', serverSelectionTimeoutMS=5000) as mongo:
        mongo.admin.command('ping')
        if destination['name'] in mongo.list_database_names():
            raise ValueError('MongoDB QA database already exists. Choose a new QA177_RUN_ID.')
        connection = psycopg2.connect(dbname='postgres', user='qa149', password='qa149-local-only',
                                      host='127.0.0.1', port=55439, connect_timeout=5)
        try:
            connection.autocommit = True
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1 FROM pg_database WHERE datname = %s', (destination['name'],))
                if cursor.fetchone():
                    raise ValueError('PostgreSQL QA database already exists. Choose a new QA177_RUN_ID.')
                cursor.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(destination['name'])))
        finally:
            connection.close()
    destination['root'].mkdir(parents=True, exist_ok=True)
    print(json.dumps({**destination, 'root': str(destination['root'])}))


if __name__ == '__main__':
    prepare()
