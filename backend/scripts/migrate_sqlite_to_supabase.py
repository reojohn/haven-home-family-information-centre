"""One-time, additive SQLite -> Supabase PostgreSQL migration for Haven Home.

This script does not change the SQLite file or application's backend/.env.
It requires a *completely empty* set of Haven Home tables in the target.
It refuses migrations if there are unsupported extra SQLite columns to avoid
silently dropping data. The app should be stopped while migrating.

Usage (project root):
  python -m backend.scripts.migrate_sqlite_to_supabase --check
  python -m backend.scripts.migrate_sqlite_to_supabase --migrate
  python -m backend.scripts.migrate_sqlite_to_supabase --verify
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from collections import OrderedDict
from datetime import date, datetime
from pathlib import Path

from dotenv import dotenv_values
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

PROJECT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = PROJECT / 'backend' / 'data' / 'hic.sqlite3'
DEFAULT_TARGET_CONFIG = PROJECT / 'backend' / '.env.supabase'


def fail(message: str) -> None:
    raise RuntimeError(message)


def target_url(config_file: Path):
    if not config_file.is_file():
        fail(f'Missing configuration file: {config_file}. Copy backend/.env.supabase.example and edit it locally.')
    variables = dotenv_values(config_file)
    value = (variables.get('DATABASE_URL') or '').strip()
    if not value or '[YOUR-PASSWORD]' in value or 'YOUR_PASSWORD' in value or 'YOUR-PROJECT' in value:
        fail('Add your actual Supabase Postgres connection string to backend/.env.supabase before migrating.')
    try:
        parsed = make_url(value)
    except Exception:
        fail('The DATABASE_URL is invalid. Copy the Session pooler connection string from Supabase Connect.')
    if parsed.get_backend_name() != 'postgresql':
        fail('DATABASE_URL must be a PostgreSQL URL (not SQLite or a Supabase REST API URL).')
    host = (parsed.host or '').lower()
    if not (host.endswith('.pooler.supabase.com') or host.endswith('.supabase.co')):
        fail('Target must be an actual Supabase Postgres host; refusing to write to another database.')
    if parsed.drivername != 'postgresql+psycopg':
        parsed = parsed.set(drivername='postgresql+psycopg')
    if parsed.query.get('sslmode') not in ('verify-full', 'verify-ca', 'require'):
        parsed = parsed.update_query_dict({'sslmode': 'require'})
    return parsed


def engine_for_postgres(url):
    # Transaction pooler uses port 6543 and cannot use psycopg server-side prepares.
    options = {'connect_timeout': 12}
    if url.port == 6543:
        options['prepare_threshold'] = None
    return create_engine(url, pool_pre_ping=True, pool_size=2, max_overflow=0,
                         pool_recycle=1800, connect_args=options)


def tables():
    # Import only here, after parsing config; the local default db engine is never used.
    from backend.app.db import Base
    from backend.app import models  # noqa: F401 -- registers all models
    return list(Base.metadata.sorted_tables), Base.metadata


def known_rows(source_conn, table, existing_cols):
    cols = [c for c in table.columns if c.name in existing_cols]
    return [dict(r) for r in source_conn.execute(select(*cols)).mappings().all()]


def canonical(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat(timespec='microseconds') if isinstance(value, datetime) else value.isoformat()
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, float):
        return round(value, 9)
    return value


def checksum(rows):
    # Check every column, not merely row counts. Keep user information out of log output.
    normalized = [json.dumps({k: canonical(v) for k, v in sorted(r.items())},
                             separators=(',', ':'), sort_keys=True, ensure_ascii=False)
                  for r in rows]
    h = hashlib.sha256()
    for line in sorted(normalized):
        h.update(line.encode('utf-8'))
        h.update(b'\n')
    return h.hexdigest()


def snapshot_source(sqlite, table_list):
    from sqlalchemy import inspect as sqlalchemy_inspect
    inspector = sqlalchemy_inspect(sqlite)
    existing = set(inspector.get_table_names())
    if 'households' not in existing or 'users' not in existing:
        fail('SQLite source has no households/users tables. Check the source path; refusing to migrate an empty or wrong file.')
    snapshot = OrderedDict()
    with sqlite.connect() as conn:
        for table in table_list:
            if table.name not in existing:
                # Older SQLite versions may not have optional newer feature tables.
                snapshot[table.name] = []
                continue
            cols = {c['name'] for c in inspector.get_columns(table.name)}
            expected = {c.name for c in table.columns}
            unknown = cols - expected
            if unknown:
                fail(f'Unexpected SQLite columns in {table.name}: {", ".join(sorted(unknown))}. Migration stopped to prevent data loss.')
            missing = expected - cols
            if missing:
                fail(f'Missing SQLite columns in {table.name}: {", ".join(sorted(missing))}. Update the local database/schema before migrating.')
            snapshot[table.name] = known_rows(conn, table, cols)
    return snapshot


def verify_rows(target, table_list, source):
    with target.connect() as conn:
        problems = []
        for table in table_list:
            expected = source[table.name]
            actual = [dict(r) for r in conn.execute(select(table)).mappings()]
            if len(actual) != len(expected) or checksum(actual) != checksum(expected):
                problems.append(table.name)
        if problems:
            fail('Supabase verification mismatch in: ' + ', '.join(problems) + '. Do not switch the backend.')


def count_rows(target, table_list):
    inspector = inspect(target)
    existing = set(inspector.get_table_names(schema='public'))
    with target.connect() as conn:
        return {table.name: (conn.execute(select(text('count(*)')).select_from(table)).scalar_one()
                             if table.name in existing else 0) for table in table_list}


def secure_tables(conn, table_list):
    # The app connects using the privileged server-side database role and enforces
    # household_id ownership in FastAPI. Public Data API roles must have no access.
    for table in table_list:
        quoted = '"' + table.name.replace('"', '""') + '"'
        conn.execute(text(f'ALTER TABLE public.{quoted} ENABLE ROW LEVEL SECURITY'))
        conn.execute(text(f'REVOKE ALL ON TABLE public.{quoted} FROM anon, authenticated'))


def reset_id_sequences(conn, table_list, snapshot):
    for table in table_list:
        if 'id' not in table.columns:
            continue
        seq = conn.execute(text('SELECT pg_get_serial_sequence(:table_name, :column_name)'),
                           {'table_name': f'public.{table.name}', 'column_name': 'id'}).scalar_one_or_none()
        if not seq:
            fail(f'No ID sequence for {table.name}. Cannot safely generate new IDs after migration.')
        max_id = max((row['id'] for row in snapshot[table.name]), default=None)
        conn.execute(text('SELECT setval(CAST(:sequence_name AS regclass), :value, :called)'),
                     {'sequence_name': seq, 'value': max_id if max_id is not None else 1,
                      'called': max_id is not None})


def run_migration(source, target, table_list, metadata, snapshot, mode):
    if mode == 'check':
        with target.connect() as conn:
            conn.execute(text('SELECT 1')).scalar_one()
        print('Supabase connection successful (encrypted PostgreSQL).')
        print('Local source records:', sum(map(len, snapshot.values())))
        print('No records were changed.')
        return

    if mode == 'verify':
        verify_rows(target, table_list, snapshot)
        print('SUCCESS: all source records match Supabase (row counts + content checksums).')
        return

    # Refuse to replace the target's current HIC records. Never upsert or truncate.
    existing = count_rows(target, table_list)
    occupied = [name for name, count in existing.items() if count]
    if occupied:
        fail('Supabase already contains Haven Home records in: ' + ', '.join(occupied) +
             '. Migration will not overwrite or merge them. Use an empty Supabase project.')

    # Create schema only after confirming that the destination is empty.
    metadata.create_all(bind=target)
    with target.begin() as conn:
        secure_tables(conn, table_list)
        for table in table_list:
            rows = snapshot[table.name]
            if rows:
                # Chunk to avoid very large parameter batches.
                for i in range(0, len(rows), 250):
                    conn.execute(table.insert(), rows[i:i+250])
        reset_id_sequences(conn, table_list, snapshot)
    verify_rows(target, table_list, snapshot)
    print('MIGRATION SUCCESS: all tables transferred and checked.')
    print('Supabase RLS enabled; anon/authenticated Data API grants revoked for app tables.')
    for name, rows in snapshot.items():
        print(f'  {name}: {len(rows)}')
    print('Your original SQLite file remains untouched.')
    print('You may now switch backend/.env to the Supabase connection and restart FastAPI.')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='Test connection only')
    mode.add_argument('--migrate', action='store_true', help='Copy source rows to empty Supabase, then verify')
    mode.add_argument('--verify', action='store_true', help='Read-only row count and checksum verification')
    ap.add_argument('--sqlite', type=Path, default=DEFAULT_SOURCE)
    ap.add_argument('--target-env', type=Path, default=DEFAULT_TARGET_CONFIG)
    args = ap.parse_args()
    source_path = args.sqlite.expanduser().resolve()
    if not source_path.is_file():
        fail(f'SQLite file not found at {source_path}. Your local data must exist before migrating.')
    if source_path.stat().st_size == 0:
        fail('SQLite file is empty. No migration was attempted.')
    from sqlalchemy import create_engine as sqlalchemy_create_engine
    sqlite_engine = sqlalchemy_create_engine('sqlite:///' + source_path.as_posix())
    table_list, metadata = tables()
    try:
        snapshot = snapshot_source(sqlite_engine, table_list)
        url = target_url(args.target_env.expanduser().resolve())
        pg_engine = engine_for_postgres(url)
        try:
            run_migration(sqlite_engine, pg_engine, table_list, metadata, snapshot,
                          'check' if args.check else 'verify' if args.verify else 'migrate')
        finally:
            pg_engine.dispose()
    finally:
        sqlite_engine.dispose()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, SQLAlchemyError, OSError) as exc:
        # Do not print driver exception detail, which may accidentally include a password/URL.
        if isinstance(exc, RuntimeError):
            print('ERROR:', exc, file=sys.stderr)
        else:
            print('ERROR: Could not complete the database operation.', type(exc).__name__,
                  file=sys.stderr)
            print('Check your Supabase connection string, SSL setting, and network; do not share your password.', file=sys.stderr)
        sys.exit(1)
