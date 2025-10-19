import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine
from sqlalchemy import text
from .routers import datasets, graphs, modeling

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format='%(asctime)s %(levelname)s %(name)s: %(message)s'
)
logger = logging.getLogger("udc")

app = FastAPI(title="Universal Data Cleaner", version="0.1.0")

default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
]
env_origins = os.environ.get("ALLOWED_ORIGINS")
if env_origins:
    origins = [o.strip() for o in env_origins.split(',') if o.strip()]
else:
    # For local dev you can export ALLOWED_ORIGINS="*" if needed
    origins = default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)

# Lightweight migration for newly added columns (no Alembic yet)
def _ensure_column(table: str, column: str, ddl: str):
    try:
        with engine.connect() as conn:
            existing = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))]
            if column not in existing:
                logger.info("Altering table %s: adding missing column %s", table, column)
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
    except Exception as e:
        logger.warning("Failed adding column %s.%s: %s", table, column, e)

# Only run for SQLite (simple) - you can migrate to Alembic later
try:
    _ensure_column('datasets', 'updated_at', 'TIMESTAMP')
    _ensure_column('datasets', 'is_deleted', 'BOOLEAN DEFAULT 0')
    _ensure_column('datasets', 'pipeline_json', 'TEXT DEFAULT \"[]\"')
    _ensure_column('datasets', 'options_json', 'TEXT DEFAULT "{}"')
    # Newly added multi-source merge support columns
    _ensure_column('datasets', 'is_multi_source', 'BOOLEAN DEFAULT 0')
    _ensure_column('datasets', 'source_count', 'INTEGER DEFAULT 1')
    _ensure_column('datasets', 'merge_history', 'TEXT DEFAULT "[]"')
except Exception as e:
    logger.warning("Column ensure step failed: %s", e)

logger.info("Database tables ensured & columns patched. CORS origins: %s", origins)

app.include_router(datasets.router)
app.include_router(graphs.router)
app.include_router(modeling.router)

@app.get("/health")
def health():
    return {"status": "ok"}
