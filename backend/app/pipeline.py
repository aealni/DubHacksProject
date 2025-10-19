from __future__ import annotations
from typing import List
import pandas as pd
from sqlalchemy.engine import Engine

from .cleaning import cleaned_table_name


def save_cleaned_to_sqlite(df: pd.DataFrame, dataset_id: int, engine: Engine, if_exists: str = 'replace') -> None:
    """Persist cleaned dataframe to a per-dataset table.
    Table name pattern: cleaned_<dataset_id>
    Uses pandas to_sql with index=False.
    """
    table = cleaned_table_name(dataset_id)
    df.to_sql(table, engine, if_exists=if_exists, index=False)


def load_preview_from_sqlite(dataset_id: int, engine: Engine, limit: int = 50) -> pd.DataFrame:
    table = cleaned_table_name(dataset_id)
    # Use read_sql_query for limit
    query = f"SELECT * FROM {table} LIMIT {int(limit)}"
    return pd.read_sql_query(query, engine)


def list_table_columns(dataset_id: int, engine: Engine) -> List[str]:
    table = cleaned_table_name(dataset_id)
    # Use PRAGMA table_info
    with engine.connect() as conn:
        res = conn.execute(f"PRAGMA table_info({table})")
        cols = [row[1] for row in res.fetchall()]
    return cols
