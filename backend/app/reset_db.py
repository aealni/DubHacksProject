import os
from .db import engine, Base, DATABASE_URL
from sqlalchemy import text

SQLITE_PATH = DATABASE_URL.replace('sqlite:///','') if DATABASE_URL.startswith('sqlite:///') else None

def drop_all_tables():
    with engine.connect() as conn:
        res = conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [r[0] for r in res.fetchall() if not r[0].startswith('sqlite_')]
        for t in tables:
            try:
                conn.exec_driver_sql(f'DROP TABLE IF EXISTS {t}')
            except Exception:
                pass

def full_reset(delete_file: bool = False):
    """Reset database: optionally delete SQLite file + WAL/SHM then recreate schema."""
    if SQLITE_PATH and delete_file:
        try:
            engine.dispose()
        finally:
            for suffix in ['', '-wal', '-shm']:
                path = SQLITE_PATH + suffix
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except Exception:
                        pass
    else:
        drop_all_tables()
    Base.metadata.create_all(bind=engine)
    return True

def integrity_check():
    if not SQLITE_PATH:
        return {"status": "unknown", "message": "Not a SQLite file URL"}
    try:
        with engine.connect() as conn:
            res = conn.exec_driver_sql("PRAGMA integrity_check;").fetchone()
            return {"status": res[0]}
    except Exception as e:
        return {"status": "error", "message": str(e)}

def attempt_corruption_recovery(escalate: bool = False):
    """Attempt recovery. If escalate=True perform full file reset; else drop tables only."""
    full_reset(delete_file=escalate)
    return True
