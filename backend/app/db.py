"""Haven Home SQLAlchemy setup: local SQLite or server-side Supabase Postgres."""
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
except ImportError:
    pass

DEFAULT_PATH = ROOT / 'data' / 'hic.sqlite3'
# Vercel's deployed source filesystem is read-only. Require the persistent
# Supabase PostgreSQL DATABASE_URL there instead of silently using SQLite.
if os.getenv('VERCEL') == '1' and not os.getenv('DATABASE_URL'):
    raise RuntimeError('DATABASE_URL is required on Vercel. Set the Supabase pooler connection URL in the backend project Environment Variables.')
url_string = os.getenv('DATABASE_URL', f'sqlite:///{DEFAULT_PATH}')
url = make_url(url_string)

if url.get_backend_name() == 'postgresql':
    if url.drivername != 'postgresql+psycopg':
        url = url.set(drivername='postgresql+psycopg')
    # Require encrypted connections to a hosted Supabase database. The value can
    # be strengthened to verify-full with sslrootcert in the connection URL.
    if url.query.get('sslmode') not in ('require', 'verify-ca', 'verify-full'):
        url = url.update_query_dict({'sslmode': 'require'})
    connect_args = {'connect_timeout': 12}
    # Supabase's transaction pooler (6543) does not support prepared statements.
    if url.port == 6543:
        connect_args['prepare_threshold'] = None
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True,
                           pool_size=3, max_overflow=2, pool_recycle=1800)
else:
    # Local SQLite remains available for development and isolated tests.
    # Do not create a local data directory during a PostgreSQL deployment.
    if url.get_backend_name() == 'sqlite':
        DEFAULT_PATH.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args={'check_same_thread': False}
                           if url.get_backend_name() == 'sqlite' else {},
                           pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    with SessionLocal() as session:
        yield session
