"""Offline migration checks; no Supabase credentials or external network needed."""
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from backend.app.db import Base
from backend.app import models
from backend.scripts.migrate_sqlite_to_supabase import (
    checksum, snapshot_source, target_url, verify_rows, run_migration
)


def test_all_table_rows_and_checksums_survive_copy(tmp_path):
    src = create_engine('sqlite:///' + str(tmp_path / 'source.sqlite3'))
    dest = create_engine('sqlite:///' + str(tmp_path / 'dest.sqlite3'))
    try:
        Base.metadata.create_all(src)
        with src.begin() as conn:
            conn.execute(models.Household.__table__.insert(),
                         [{'id': 5, 'name': 'Sample Home', 'invite_code': 'TESTCODE234'}])
            conn.execute(models.User.__table__.insert(),
                         [{'id': 8, 'household_id': 5, 'name': 'Test Person',
                           'email': 'test@example.com', 'password_hash': 'hash',
                           'created_at': models.utc_now()}])
            conn.execute(models.UserAvatar.__table__.insert(),
                         [{'user_id': 8, 'avatar_id': 'male_01'}])
            conn.execute(models.HouseholdDevice.__table__.insert(),
                         [{'id': 12, 'household_id': 5, 'name': 'Fan', 'room': 'Bedroom',
                           'kind': 'Electric Fan', 'status': 'off', 'updated_at': models.utc_now()}])
            conn.execute(models.HouseholdSunLocation.__table__.insert(),
                         [{'household_id': 5, 'city_id': 'butuan'}])
        table_list = list(Base.metadata.sorted_tables)
        snapshot = snapshot_source(src, table_list)
        Base.metadata.create_all(dest)
        with dest.begin() as conn:
            for table in table_list:
                if snapshot[table.name]:
                    conn.execute(table.insert(), snapshot[table.name])
        verify_rows(dest, table_list, snapshot)
        assert sum(map(len, snapshot.values())) == 5
        with dest.begin() as conn:
            conn.execute(models.UserAvatar.__table__.update().values(avatar_id='female_02'))
        with pytest.raises(RuntimeError, match='verification mismatch'):
            verify_rows(dest, table_list, snapshot)
    finally:
        src.dispose(); dest.dispose()


def test_target_url_rejects_sqlite_and_non_supabase_hosts(tmp_path):
    config = tmp_path / '.env.supabase'
    config.write_text('DATABASE_URL=sqlite:///temp.db\n')
    with pytest.raises(RuntimeError, match='PostgreSQL'):
        target_url(config)
    config.write_text('DATABASE_URL=postgresql://x:pass@example.com:5432/postgres\n')
    with pytest.raises(RuntimeError, match='actual Supabase'):
        target_url(config)
    config.write_text('DATABASE_URL=postgresql://postgres.ref:pass@aws-0-test.pooler.supabase.com:5432/postgres\n')
    url = target_url(config)
    assert url.drivername == 'postgresql+psycopg'
    assert url.query['sslmode'] == 'require'
    assert 'pass' not in str(url)
