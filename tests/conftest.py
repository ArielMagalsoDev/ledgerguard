import os
import tempfile

# Set before any `ledgerguard.*` module is imported anywhere in the test
# session — ledgerguard/db.py creates its module-level `engine` singleton at
# import time, so this has to land first. A real file-based SQLite DB (not
# `:memory:`) matters here specifically because FastAPI's TestClient runs
# sync route handlers in a worker thread; SQLite's `:memory:` database is
# private per-connection, so a worker thread would see an empty database
# even though `init_db()` ran (in the main thread) moments earlier. A file
# on disk is shared correctly across threads/connections.
_TEST_DB_PATH = os.path.join(tempfile.mkdtemp(prefix="ledgerguard-test-"), "test.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB_PATH}")
os.environ.setdefault("PDF_STORAGE_DIR", tempfile.mkdtemp(prefix="ledgerguard-test-pdfs-"))

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from ledgerguard.db import Base
from ledgerguard.seed import seed_all


@pytest.fixture()
def db_session():
    """A fresh isolated in-memory DB per test — independent of the shared
    file-based DB the app-level (test_http.py) fixtures use."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(engine)
    session = Session()
    seed_all(session)
    yield session
    session.close()
