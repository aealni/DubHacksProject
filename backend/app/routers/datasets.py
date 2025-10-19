import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Request, Form
from sqlalchemy.orm import Session
from sqlalchemy import text

import time
import sqlite3
import pandas as pd
from ..db import get_db, engine
from ..reset_db import full_reset, attempt_corruption_recovery, integrity_check
from .. import models, schemas
from ..cleaning import read_file_to_df, run_cleaning_pipeline, cleaned_table_name, CleaningConfig
from ..profiling import profile_columns
from ..pipeline import save_cleaned_to_sqlite, load_preview_from_sqlite, list_table_columns
from ..merge import perform_merge_operation, update_dataset_with_merge, get_available_merge_columns, MergeError
from datetime import datetime
from sqlalchemy import insert

logger = logging.getLogger("udc.upload")
router = APIRouter()

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB per spec
ALLOWED_EXT = {'.csv', '.xlsx', '.xls'}


def _validate_extension(filename: str):
    lower = filename.lower()
    for ext in ALLOWED_EXT:
        if lower.endswith(ext):
            return
    raise HTTPException(status_code=400, detail="Unsupported file type. Use CSV or XLSX")

def qi(name: str) -> str:
    """Quote identifier for SQLite."""
    return '"' + name.replace('"','""') + '"'


def _snapshot_table(dataset_id: int, conn, source_table: str) -> Optional[int]:
    """Create a snapshot of the current cleaned table right AFTER the operation log row is inserted.

    Strategy:
      1. Insert an operation_logs row externally (caller) and retrieve its id (last_insert_rowid()).
      2. Duplicate cleaned_<id> into snap_<id>_<log_id>.
    Returns the snapshot log_id used or None on failure.
    """
    try:
        # fetch last log id for this connection via SQLite function
        log_id = conn.exec_driver_sql("SELECT last_insert_rowid()").scalar()
        if log_id is None:
            return None
        snap_name = f"snap_{dataset_id}_{log_id}"
        cleaned = cleaned_table_name(dataset_id)
        conn.exec_driver_sql(f'CREATE TABLE IF NOT EXISTS {snap_name} AS SELECT * FROM {cleaned}')
        return log_id
    except Exception as e:
        logger.warning("Snapshot creation failed for dataset %s: %s", dataset_id, e)
        return None


def _build_report_block(meta: dict) -> schemas.ReportBlock:
    """Normalize raw metadata dict into ReportBlock ensuring required keys with defaults."""
    return schemas.ReportBlock(
        duplicates_removed=meta.get('duplicates_removed', 0),
        rows_dropped_for_missing=meta.get('rows_dropped_for_missing', 0),
        missing_by_column=meta.get('missing_by_column', {}),
        dtype_inference=meta.get('dtype_inference', {}),
        date_columns_standardized=meta.get('date_columns_standardized', []),
        notes=meta.get('notes', []),
        header_row_detected=meta.get('header_row_detected'),
        header_quality_score=meta.get('header_quality_score')
    )


@router.post('/upload', response_model=schemas.UploadResponse)
async def upload_dataset(
    file: UploadFile = File(...),
    drop_row_missing_pct: float = 0.6,
    lowercase_categoricals: bool = True,
    missing_mode: str = 'drop_rows',
    config: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload and clean a dataset (spec-aligned response).

    Priority of config: explicit JSON 'config' overrides individual query params if provided.
    """
    _validate_extension(file.filename)
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large")
    try:
        df_raw = read_file_to_df(file.filename, content)
    except Exception as e:
        logger.exception("File read failed: %s", e)
        raise HTTPException(status_code=400, detail=f"Failed to read file: {e}")

    if config:
        try:
            cfg_obj = CleaningConfig(**json.loads(config))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid config JSON: {e}")
    else:
        cfg_obj = CleaningConfig(
            drop_row_missing_threshold=drop_row_missing_pct,
            lowercase_categoricals=lowercase_categoricals,
            missing_mode=missing_mode  # validate through model
        )

    raw_rows, raw_cols = df_raw.shape
    cleaned_df, meta = run_cleaning_pipeline(df_raw, cfg_obj)
    cleaned_rows, cleaned_cols = cleaned_df.shape
    steps = [
        "standardize_column_names",
        "infer_and_cast_dtypes",
        "normalize_categoricals",
        "remove_duplicates",
        "handle_missing_values"
    ]
    corruption_stage = 0  # 0: normal, 1: after table-drop recovery, 2: after full file reset
    while True:
        try:
            logger.info("Processing upload filename=%s raw_shape=%s", file.filename, (raw_rows, raw_cols))
            dataset = models.Dataset(
                name=file.filename.rsplit('.', 1)[0],
                original_filename=file.filename,
                raw_file_path=None,
                n_rows_raw=raw_rows,
                n_cols_raw=raw_cols,
                n_rows_clean=cleaned_rows,
                n_cols_clean=cleaned_cols,
                pipeline_json=json.dumps(steps),
                options_json=json.dumps(cfg_obj.model_dump())
            )
            db.add(dataset)
            db.commit()
            db.refresh(dataset)

            table_name = cleaned_table_name(dataset.id)
            # Persist raw table BEFORE cleaning result finalize (exact original dataframe, no mutation besides pandas read interpretation)
            try:
                raw_table = f"raw_{dataset.id}"
                # store raw without index
                df_raw.to_sql(raw_table, con=engine, if_exists='replace', index=False)
            except Exception as e:
                logger.warning("Failed storing raw table for dataset %s: %s", dataset.id, e)
            max_attempts = 5
            for attempt in range(1, max_attempts + 1):
                try:
                    save_cleaned_to_sqlite(cleaned_df, dataset.id, engine, if_exists='replace')
                    break
                except (sqlite3.OperationalError, Exception) as e:
                    if 'locked' in str(e).lower() and attempt < max_attempts:
                        sleep_time = 0.3 * attempt
                        logger.warning("Locked writing table %s (attempt %s/%s), retrying in %.1fs", table_name, attempt, max_attempts, sleep_time)
                        time.sleep(sleep_time)
                        continue
                    else:
                        raise
            report = models.CleaningReport(
                dataset_id=dataset.id,
                summary_json=json.dumps(meta),
                issues_json=json.dumps({}),
            )
            db.add(report)
            db.commit()
            # Log operation
            try:
                db.execute(text("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d, :a, :p, :c)"),
                           {"d": dataset.id, "a": "upload", "p": json.dumps({"rows_raw": raw_rows, "cols_raw": raw_cols}), "c": datetime.utcnow()})
                db.commit()
            except Exception as e:
                logger.warning("Failed logging upload operation: %s", e)
            break
        except Exception as e:
            db.rollback()
            err_str = str(e).lower()
            if 'malformed' in err_str:
                if corruption_stage == 0:
                    logger.error("Corruption detected (stage 0). Dropping tables and retrying upload once.")
                    attempt_corruption_recovery(escalate=False)
                    corruption_stage = 1
                    continue
                elif corruption_stage == 1:
                    logger.error("Corruption persisted (stage 1). Performing full file reset (WAL/SHM removed) and retrying last time.")
                    attempt_corruption_recovery(escalate=True)
                    corruption_stage = 2
                    continue
                else:
                    integrity = integrity_check()
                    logger.exception("Corruption recovery failed after escalation: %s", e)
                    raise HTTPException(status_code=500, detail=f"Database corruption persists after full reset. integrity_check={integrity}. Manual delete of app.db recommended.")
            logger.exception("Storing dataset failed: %s", e)
            raise HTTPException(status_code=400, detail=f"Failed to store dataset: {e}")

    preview_rows = cleaned_df.head(10).to_dict(orient='records')
    report_block = {
        'duplicates_removed': meta.get('duplicates_removed', 0),
        'rows_dropped_for_missing': meta.get('rows_dropped_for_missing', 0),
        'missing_by_column': meta.get('missing_by_column', {}),
        'dtype_inference': meta.get('dtype_inference', {}),
        'date_columns_standardized': meta.get('date_columns_standardized', []),
        'notes': meta.get('notes', [])
    }
    # Pass through heuristic fields if present (optional)
    if 'header_row_detected' in meta:
        report_block['header_row_detected'] = meta['header_row_detected']
    if 'header_quality_score' in meta:
        report_block['header_quality_score'] = meta['header_quality_score']
    logger.info("Upload complete dataset_id=%s cleaned_shape=%s", dataset.id, (cleaned_rows, cleaned_cols))
    return schemas.UploadResponse(
        dataset_id=dataset.id,
        name=file.filename,
        rows_raw=raw_rows,
        cols_raw=raw_cols,
        rows_clean=cleaned_rows,
        cols_clean=cleaned_cols,
        preview=schemas.PreviewBlock(columns=cleaned_df.columns.tolist(), rows=preview_rows, total_rows=cleaned_rows, offset=0, limit=10),
        report=report_block
    )


@router.get('/datasets', response_model=schemas.ListDatasetsResponse)
def list_datasets(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    q = (
        db.query(models.Dataset)
        .order_by(models.Dataset.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [
        schemas.DatasetListItem(
            id=d.id,
            name=d.name,
            original_filename=d.original_filename,
            rows_raw=d.n_rows_raw,
            cols_raw=d.n_cols_raw,
            rows_clean=d.n_rows_clean,
            cols_clean=d.n_cols_clean,
            created_at=d.created_at
        ) for d in q
    ]
    return schemas.ListDatasetsResponse(datasets=items)


@router.get('/dataset/{dataset_id}/preview', response_model=schemas.PreviewResponse)
def dataset_preview(dataset_id: int, db: Session = Depends(get_db), limit: int = 10, offset: int = 0):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    try:
        if offset < 0:
            offset = 0
        table = cleaned_table_name(dataset_id)
        # Rowid included for edit references
        query = f'SELECT rowid as _rowid, * FROM {table} LIMIT {limit} OFFSET {offset}'
        df = pd.read_sql_query(query, con=engine)
        total = dataset.n_rows_clean
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read cleaned table")
    cols = df.columns.tolist()
    return schemas.PreviewResponse(preview=schemas.PreviewBlock(columns=cols, rows=df.to_dict(orient='records'), total_rows=total, offset=offset, limit=limit))


@router.get('/dataset/{dataset_id}/metadata', response_model=schemas.MetadataResponse)
def dataset_metadata(dataset_id: int, db: Session = Depends(get_db)):
    report = db.query(models.CleaningReport).filter(models.CleaningReport.dataset_id == dataset_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Metadata not found")
    meta = json.loads(report.summary_json)
    report_block = {
        'duplicates_removed': meta.get('duplicates_removed', 0),
        'rows_dropped_for_missing': meta.get('rows_dropped_for_missing', 0),
        'missing_by_column': meta.get('missing_by_column', {}),
        'dtype_inference': meta.get('dtype_inference', {}),
        'date_columns_standardized': meta.get('date_columns_standardized', []),
        'notes': meta.get('notes', [])
    }
    if 'header_row_detected' in meta:
        report_block['header_row_detected'] = meta['header_row_detected']
    if 'header_quality_score' in meta:
        report_block['header_quality_score'] = meta['header_quality_score']
    return schemas.MetadataResponse(report=report_block)


@router.get('/dataset/{dataset_id}')
def get_dataset_info(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    return {
        "id": dataset.id,
        "name": dataset.name,
        "original_filename": dataset.original_filename,
        "rows_clean": dataset.n_rows_clean,
        "cols_clean": dataset.n_cols_clean,
        "upload_date": dataset.created_at.isoformat() if dataset.created_at else None
    }


@router.delete('/dataset/{dataset_id}')
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    # Check if dataset exists first
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    try:
        # Delete related records with synchronize_session=False for better performance
        db.query(models.CleaningReport).filter(
            models.CleaningReport.dataset_id == dataset_id
        ).delete(synchronize_session=False)
        
        db.query(models.OperationLog).filter(
            models.OperationLog.dataset_id == dataset_id
        ).delete(synchronize_session=False)
        
        # Delete the dataset record
        db.query(models.Dataset).filter(
            models.Dataset.id == dataset_id
        ).delete(synchronize_session=False)
        
        # Commit all deletions
        db.commit()
        
        # Drop the cleaned table outside of the main transaction to avoid locks
        table_name = cleaned_table_name(dataset_id)
        try:
            # Use separate connection with immediate commit for table drop
            with engine.begin() as conn:
                conn.exec_driver_sql(f"DROP TABLE IF EXISTS {qi(table_name)}")
        except Exception as e:
            # Log but don't fail the request if table drop fails
            logger.warning(f"Failed to drop table {table_name}: {e}")
    
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete dataset {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete dataset")
    
    return {"message": "Dataset deleted successfully"}


from fastapi.responses import StreamingResponse
from io import StringIO
import pandas as pd


@router.get('/dataset/{dataset_id}/download.csv')
def download_cleaned(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    table = cleaned_table_name(dataset_id)
    # Stream using SQL chunking to avoid loading entire table for very large datasets
    def row_iter():
        # First yield header
        cols = list_table_columns(table, engine)
        if not cols:
            return
        yield ','.join(cols) + '\n'
        try:
            for chunk in pd.read_sql_query(f'SELECT * FROM {table}', con=engine, chunksize=1000):
                for _, row in chunk.iterrows():
                    yield ','.join(['' if pd.isna(v) else str(v) for v in row.values]) + '\n'
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to stream cleaned table")
    headers = {'Content-Disposition': f'attachment; filename="cleaned_{dataset_id}.csv"'}
    return StreamingResponse(row_iter(), media_type='text/csv', headers=headers)


@router.put('/dataset/{dataset_id}/reclean', response_model=schemas.MetadataResponse)
def reclean_dataset(dataset_id: int, config: Optional[schemas.CleaningConfig] = None, db: Session = Depends(get_db)):
    """Re-run cleaning pipeline on existing cleaned data (acts as source). NOTE: Ideally should re-run on raw data which is not currently stored separately."""
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id, models.Dataset.is_deleted == False).first()  # noqa: E712
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    table = cleaned_table_name(dataset_id)
    try:
        df_current = pd.read_sql_table(table, con=engine)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read existing cleaned table")
    cfg = config or schemas.CleaningConfig()
    df_new, metadata = run_cleaning_pipeline(df_current, cfg)
    metadata['profile'] = profile_columns(df_new)
    new_rows, new_cols = df_new.shape
    steps = [
        "standardize_column_names",
        "infer_and_cast_dtypes",
        "normalize_categoricals",
        "remove_duplicates",
        "handle_missing_values"
    ]
    try:
        max_attempts = 5
        for attempt in range(1, max_attempts + 1):
            try:
                save_cleaned_to_sqlite(df_new, dataset.id, engine, if_exists='replace')
                break
            except (sqlite3.OperationalError, Exception) as e:
                if 'locked' in str(e).lower() and attempt < max_attempts:
                    time.sleep(0.3 * attempt)
                    continue
                else:
                    raise
        # update dataset stats
        dataset.n_rows_clean = new_rows
        dataset.n_cols_clean = new_cols
        dataset.pipeline_json = json.dumps(steps)
        report = db.query(models.CleaningReport).filter(models.CleaningReport.dataset_id == dataset_id).first()
        if report:
            report.summary_json = json.dumps(metadata)
            report.issues_json = json.dumps({})
        else:
            report = models.CleaningReport(dataset_id=dataset_id, summary_json=json.dumps(metadata), issues_json=json.dumps({}))
            db.add(report)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Re-clean failed: {e}")
    # Return normalized report
    return schemas.MetadataResponse(report=_build_report_block(metadata))

@router.put('/dataset/{dataset_id}/reprocess', response_model=schemas.MetadataResponse)
def reprocess_from_raw(dataset_id: int, config: Optional[schemas.CleaningConfig] = None, db: Session = Depends(get_db)):
    """Re-run cleaning pipeline starting from raw_<id> table so previously dropped rows can be restored.

    Fallback behavior: If the raw_<id> table is missing (e.g. dataset was uploaded before raw preservation feature
    was introduced, or the table was manually deleted), we fall back to using the current cleaned table as the source
    (matching legacy 'reclean' behavior). In that case no rows previously dropped can be restored, but the user still
    gets an updated cleaning run. The response metadata is the same; a fallback flag is logged in operation history.
    """
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id, models.Dataset.is_deleted == False).first()  # noqa: E712
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    raw_table = f"raw_{dataset_id}"
    fallback_used = False
    try:
        df_raw = pd.read_sql_table(raw_table, con=engine)
    except Exception:
        # Fallback to current cleaned table if raw not found
        try:
            fallback_used = True
            df_raw = pd.read_sql_table(cleaned_table_name(dataset_id), con=engine)
        except Exception:
            raise HTTPException(status_code=404, detail="Raw data not found and fallback to cleaned failed")
    cfg = config or schemas.CleaningConfig()
    df_new, metadata = run_cleaning_pipeline(df_raw, cfg)
    new_rows, new_cols = df_new.shape
    steps = [
        "standardize_column_names",
        "infer_and_cast_dtypes",
        "normalize_categoricals",
        "remove_duplicates",
        "handle_missing_values"
    ]
    try:
        save_cleaned_to_sqlite(df_new, dataset.id, engine, if_exists='replace')
        dataset.n_rows_clean = new_rows
        dataset.n_cols_clean = new_cols
        dataset.pipeline_json = json.dumps(steps)
        report = db.query(models.CleaningReport).filter(models.CleaningReport.dataset_id == dataset_id).first()
        if report:
            report.summary_json = json.dumps(metadata)
        else:
            report = models.CleaningReport(dataset_id=dataset_id, summary_json=json.dumps(metadata), issues_json=json.dumps({}))
            db.add(report)
        db.commit()
        try:
            log_params = cfg.model_dump()
            if fallback_used:
                log_params["fallback_used"] = True
            db.execute(text("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)"),
                       {"d": dataset_id, "a": "reprocess", "p": json.dumps(log_params), "c": datetime.utcnow()})
            db.commit()
        except Exception as e:
            logger.warning("Failed logging reprocess: %s", e)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Reprocess failed: {e}")
    return schemas.MetadataResponse(report=_build_report_block(metadata))


@router.delete('/dataset/{dataset_id}')
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    # Hard delete: drop cleaned table then remove report & dataset
    table = cleaned_table_name(dataset_id)
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql(f'DROP TABLE IF EXISTS {table}')
    except Exception as e:
        logger.warning("Failed dropping cleaned table %s: %s", table, e)
    # Delete report
    db.query(models.CleaningReport).filter(models.CleaningReport.dataset_id == dataset_id).delete()
    db.delete(dataset)
    db.commit()
    return {"status": "deleted"}


@router.patch('/dataset/{dataset_id}/cells')
def edit_cells(dataset_id: int, batch: schemas.CellEditBatch, db: Session = Depends(get_db)):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    table = cleaned_table_name(dataset_id)
    # Basic validation: ensure columns exist
    if not batch.edits:
        return {"updated": 0}
    with engine.begin() as conn:
        existing_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
        for e in batch.edits:
            if e.column not in existing_cols:
                raise HTTPException(status_code=400, detail=f"Column {e.column} does not exist")
        # Apply edits one by one (can optimize later)
        updated = 0
        for e in batch.edits:
            # Use parameter binding
            col_q = qi(e.column)
            conn.exec_driver_sql(
                f"UPDATE {table} SET {col_q} = :val WHERE rowid = :rid",
                {"val": e.value, "rid": e.rowid}
            )
            updated += 1
    # Log
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                                 {"d": dataset_id, "a": "edit_cells", "p": json.dumps({"count": updated}), "c": datetime.utcnow()})
            _snapshot_table(dataset_id, conn, table)
    except Exception as e:
        logger.warning("Failed logging/snapshot edit_cells: %s", e)
    return {"updated": updated}


@router.patch('/dataset/{dataset_id}/columns')
def rename_columns(dataset_id: int, batch: schemas.ColumnRenameBatch, db: Session = Depends(get_db)):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not batch.renames:
        return {"renamed": 0}
    table = cleaned_table_name(dataset_id)
    with engine.begin() as conn:
        existing_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
        # Validate uniqueness after rename
        target_names = set(existing_cols)
        for r in batch.renames:
            if r.old not in existing_cols:
                raise HTTPException(status_code=400, detail=f"Column {r.old} does not exist")
            # simulate rename
            target_names.discard(r.old)
            if r.new in target_names:
                raise HTTPException(status_code=400, detail=f"Target column name {r.new} already exists")
            target_names.add(r.new)
        # SQLite lacks simple RENAME COLUMN prior to modern versions; use ALTER TABLE RENAME in loop if available
        renamed = 0
        backup_table = f"num_backup_{dataset_id}"
        for r in batch.renames:
            try:
                conn.exec_driver_sql(f'ALTER TABLE {table} RENAME COLUMN {qi(r.old)} TO {qi(r.new)}')
                # Attempt rename in numeric backup if it exists
                try:
                    exists_backup = conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table' AND name = :n", {"n": backup_table}).fetchone()
                    if exists_backup:
                        backup_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({backup_table})").fetchall()]
                        if r.old in backup_cols and r.new not in backup_cols:
                            conn.exec_driver_sql(f'ALTER TABLE {backup_table} RENAME COLUMN {qi(r.old)} TO {qi(r.new)}')
                except Exception as be:
                    logger.warning("Failed renaming column in backup %s: %s", backup_table, be)
                renamed += 1
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed renaming {r.old} -> {r.new}: {e}")
    # Update dataset updated_at implicitly via ORM touch
    dataset.updated_at = dataset.updated_at  # no-op assignment
    db.add(dataset)
    db.commit()
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                                 {"d": dataset_id, "a": "rename_columns", "p": json.dumps({"renamed": renamed}), "c": datetime.utcnow()})
            _snapshot_table(dataset_id, conn, table)
    except Exception as e:
        logger.warning("Failed logging/snapshot rename_columns: %s", e)
    return {"renamed": renamed}


@router.patch('/dataset/{dataset_id}/round')
def round_columns(dataset_id: int, batch: schemas.RoundBatch, db: Session = Depends(get_db)):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not batch.rounds:
        return {"rounded": 0}
    table = cleaned_table_name(dataset_id)
    rounded = 0
    backup_table = f"num_backup_{dataset_id}"
    with engine.begin() as conn:
        existing_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
        # Create backup table once (original numeric snapshot with rowid mapping)
        exists_backup = conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table' AND name = :n", {"n": backup_table}).fetchone()
        if not exists_backup:
            try:
                conn.exec_driver_sql(f"CREATE TABLE {backup_table} AS SELECT rowid AS _orig_rowid, * FROM {table}")
            except Exception as e:
                logger.warning("Failed creating numeric backup for dataset %s: %s", dataset_id, e)
        backup_cols = []
        try:
            backup_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({backup_table})").fetchall()]
        except Exception:
            pass
        for spec in batch.rounds:
            if spec.column not in existing_cols:
                raise HTTPException(status_code=400, detail=f"Column {spec.column} does not exist")
            try:
                col_q = qi(spec.column)
                if spec.column in backup_cols:
                    conn.exec_driver_sql(
                        f"UPDATE {table} SET {col_q} = ROUND((SELECT b.{col_q} FROM {backup_table} b WHERE b._orig_rowid = {table}.rowid), :d) WHERE (SELECT b.{col_q} FROM {backup_table} b WHERE b._orig_rowid = {table}.rowid) IS NOT NULL",
                        {"d": spec.decimals}
                    )
                else:
                    conn.exec_driver_sql(f"UPDATE {table} SET {col_q} = ROUND({col_q}, :d)", {"d": spec.decimals})
                rounded += 1
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed rounding {spec.column}: {e}")
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                                 {"d": dataset_id, "a": "round", "p": json.dumps({"rounded": rounded}), "c": datetime.utcnow()})
            _snapshot_table(dataset_id, conn, table)
    except Exception as e:
        logger.warning("Failed logging/snapshot round: %s", e)
    return {"rounded": rounded}


@router.patch('/dataset/{dataset_id}/impute')
def impute_columns(dataset_id: int, batch: schemas.ImputeBatch, db: Session = Depends(get_db)):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not batch.imputations:
        return {"imputed": 0}
    table = cleaned_table_name(dataset_id)
    imputed = 0
    with engine.begin() as conn:
        existing_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
        for spec in batch.imputations:
            if spec.column not in existing_cols:
                raise HTTPException(status_code=400, detail=f"Column {spec.column} does not exist")
            try:
                if spec.strategy in ('mean','median'):
                    agg = 'avg' if spec.strategy == 'mean' else 'median'
                    # SQLite lacks MEDIAN natively; emulate via percentile using window (simpler: fetch to Python)
                    column_q = qi(spec.column)
                    if agg == 'avg':
                        val = conn.exec_driver_sql(f"SELECT AVG({column_q}) FROM {table} WHERE {column_q} IS NOT NULL").scalar()
                    else:
                        # approximate median: select value at 50th percentile
                        val = conn.exec_driver_sql(f"SELECT {column_q} FROM {table} WHERE {column_q} IS NOT NULL ORDER BY {column_q} LIMIT 1 OFFSET (SELECT COUNT(*) FROM {table} WHERE {column_q} IS NOT NULL)/2").scalar()
                    conn.exec_driver_sql(f"UPDATE {table} SET {column_q} = :v WHERE {column_q} IS NULL", {"v": val})
                elif spec.strategy == 'zero':
                    column_q = qi(spec.column)
                    conn.exec_driver_sql(f"UPDATE {table} SET {column_q} = 0 WHERE {column_q} IS NULL")
                elif spec.strategy == 'mode':
                    column_q = qi(spec.column)
                    val = conn.exec_driver_sql(f"SELECT {column_q} FROM {table} WHERE {column_q} IS NOT NULL GROUP BY {column_q} ORDER BY COUNT(*) DESC LIMIT 1").scalar()
                    if val is None:
                        val = ''
                    conn.exec_driver_sql(f"UPDATE {table} SET {column_q} = :v WHERE {column_q} IS NULL", {"v": val})
                elif spec.strategy == 'constant':
                    column_q = qi(spec.column)
                    conn.exec_driver_sql(f"UPDATE {table} SET {column_q} = :v WHERE {column_q} IS NULL", {"v": spec.constant})
                else:
                    raise HTTPException(status_code=400, detail=f"Unsupported strategy {spec.strategy}")
                imputed += 1
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed imputing {spec.column}: {e}")
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                                 {"d": dataset_id, "a": "impute", "p": json.dumps({"imputed": imputed}), "c": datetime.utcnow()})
            _snapshot_table(dataset_id, conn, table)
    except Exception as e:
        logger.warning("Failed logging/snapshot impute: %s", e)
    return {"imputed": imputed}

@router.patch('/dataset/{dataset_id}/timeformat', response_model=schemas.TimeFormatResponse)
def format_time_columns(dataset_id: int, spec: schemas.TimeFormatSpec, db: Session = Depends(get_db)):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if not spec.columns:
        return schemas.TimeFormatResponse(formatted=0, format=spec.format, columns=[])
    table = cleaned_table_name(dataset_id)
    fmt = spec.format.lower()
    formatted = 0
    # Accept keywords or strftime patterns
    with engine.begin() as conn:
        existing_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
        targets = [c for c in spec.columns if c in existing_cols]
        for col in targets:
            # Fetch column values to python for robust parsing then write back
            col_q = qi(col)
            rows = conn.exec_driver_sql(f"SELECT rowid, {col_q} FROM {table}").fetchall()
            out: list[tuple[int, any]] = []
            for rid, val in rows:
                if val is None or val == '':
                    continue
                parsed = None
                # Try several common parse patterns
                for p in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d", "%d-%m-%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"):
                    try:
                        parsed = datetime.strptime(str(val), p)
                        break
                    except Exception:
                        continue
                if parsed is None:
                    # last resort ISO parser
                    try:
                        parsed = datetime.fromisoformat(str(val).replace('Z',''))
                    except Exception:
                        continue
                if fmt == 'iso':
                    newv = parsed.isoformat()
                elif fmt == 'date':
                    newv = parsed.date().isoformat()
                elif fmt == 'epoch_ms':
                    newv = int(parsed.timestamp() * 1000)
                else:
                    # treat as strftime pattern
                    try:
                        newv = parsed.strftime(spec.format)
                    except Exception:
                        newv = parsed.isoformat()
                out.append((rid, newv))
            # write back
            for rid, newv in out:
                conn.exec_driver_sql(f"UPDATE {table} SET {col_q} = :v WHERE rowid = :rid", {"v": newv, "rid": rid})
            if out:
                formatted += 1
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                                 {"d": dataset_id, "a": "timeformat", "p": json.dumps({"formatted": formatted, "format": spec.format}), "c": datetime.utcnow()})
            _snapshot_table(dataset_id, conn, table)
    except Exception as e:
        logger.warning("Failed logging/snapshot timeformat: %s", e)
    return schemas.TimeFormatResponse(formatted=formatted, format=spec.format, columns=spec.columns)
@router.put('/dataset/{dataset_id}/revert/{log_id}')
def revert_to_snapshot(dataset_id: int, log_id: int, db: Session = Depends(get_db)):
    """Revert cleaned table to the snapshot captured immediately AFTER the specified log id.

    This means the state will reflect the dataset right after that operation completed. Only operations logged
    after snapshot feature deployment have snapshots. Upload event snapshot (if present) serves as baseline.
    """
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    snap_name = f"snap_{dataset_id}_{log_id}"
    cleaned = cleaned_table_name(dataset_id)
    # ensure snapshot exists
    try:
        with engine.begin() as conn:
            exists = conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table' AND name = :n", {"n": snap_name}).fetchone()
            if not exists:
                raise HTTPException(status_code=404, detail="Snapshot not found for log id (not captured or pruned)")
            # replace cleaned table with snapshot content (drop then recreate via copy)
            conn.exec_driver_sql(f'DROP TABLE IF EXISTS {cleaned}')
            conn.exec_driver_sql(f'CREATE TABLE {cleaned} AS SELECT * FROM {snap_name}')
            # log revert operation (and snapshot new state with new log id)
            conn.exec_driver_sql("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                                 {"d": dataset_id, "a": "revert", "p": json.dumps({"to_log_id": log_id}), "c": datetime.utcnow()})
            _snapshot_table(dataset_id, conn, cleaned)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Revert failed: {e}")
    return {"status": "reverted", "to_log_id": log_id}

@router.get('/dataset/{dataset_id}/history')
def dataset_history(dataset_id: int, limit: int = 200, offset: int = 0):
    # Simple direct SQL query (lightweight)
    try:
        rows = engine.connect().exec_driver_sql(
            "SELECT id, action_type, params_json, created_at FROM operation_logs WHERE dataset_id = :d ORDER BY id DESC LIMIT :l OFFSET :o",
            {"d": dataset_id, "l": limit, "o": offset}
        ).fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed fetching history: {e}")
    def safe_params(p: str):
        try:
            return json.loads(p)
        except Exception:
            return p
    return {
        "dataset_id": dataset_id,
        "limit": limit,
        "offset": offset,
        "events": [
            {"id": r[0], "action_type": r[1], "params": safe_params(r[2]), "created_at": r[3]} for r in rows
        ]
    }


# Multi-upload endpoints
@router.post('/dataset/{dataset_id}/add-data', response_model=schemas.MultiUploadResponse)
async def add_data_to_dataset(
    dataset_id: int,
    file: UploadFile = File(...),
    merge_strategy: str = Form(...),  # 'append_below', 'merge_on_column', 'keep_separate'
    merge_column: Optional[str] = Form(None),
    join_type: str = Form('outer'),
    prefix_conflicting_columns: bool = Form(True),
    drop_row_missing_pct: float = Form(0.6),
    lowercase_categoricals: bool = Form(True),
    missing_mode: str = Form('drop_rows'),
    config: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Add additional data to an existing dataset with specified merge strategy."""
    
    # Validate dataset exists
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Validate file
    _validate_extension(file.filename)
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large")
    
    try:
        # Read and clean new data
        df_raw = read_file_to_df(file.filename, content)
        
        if config:
            cfg_obj = CleaningConfig(**json.loads(config))
        else:
            cfg_obj = CleaningConfig(
                drop_row_missing_threshold=drop_row_missing_pct,
                lowercase_categoricals=lowercase_categoricals,
                missing_mode=missing_mode
            )
        
        cleaned_df, meta = run_cleaning_pipeline(df_raw, cfg_obj)
        
        # Perform merge operation
        if merge_strategy == 'keep_separate':
            # Create new dataset instead of merging
            new_dataset = models.Dataset(
                name=f"{dataset.name} - {file.filename.rsplit('.', 1)[0]}",
                original_filename=file.filename,
                n_rows_raw=len(df_raw),
                n_cols_raw=len(df_raw.columns),
                n_rows_clean=len(cleaned_df),
                n_cols_clean=len(cleaned_df.columns),
                pipeline_json=json.dumps(["standardize_column_names", "infer_and_cast_dtypes", "normalize_categoricals", "remove_duplicates", "handle_missing_values"]),
                options_json=json.dumps(cfg_obj.model_dump())
            )
            db.add(new_dataset)
            db.commit()
            db.refresh(new_dataset)
            
            save_cleaned_to_sqlite(cleaned_df, new_dataset.id, engine, if_exists='replace')
            
            # Create source record
            source = models.DatasetSource(
                dataset_id=new_dataset.id,
                original_filename=file.filename,
                rows_contributed=len(cleaned_df),
                cols_contributed=len(cleaned_df.columns),
                merge_strategy='keep_separate',
                source_order=1
            )
            db.add(source)
            db.commit()
            
            preview_rows = cleaned_df.head(10).to_dict(orient='records')
            return schemas.MultiUploadResponse(
                dataset_id=new_dataset.id,
                merge_strategy='keep_separate',
                rows_added=len(cleaned_df),
                cols_added=len(cleaned_df.columns),
                total_rows=len(cleaned_df),
                total_cols=len(cleaned_df.columns),
                preview=schemas.PreviewBlock(
                    columns=cleaned_df.columns.tolist(),
                    rows=preview_rows,
                    total_rows=len(cleaned_df),
                    offset=0,
                    limit=10
                ),
                report=schemas.ReportBlock(
                    duplicates_removed=meta.get('duplicates_removed', 0),
                    rows_dropped_for_missing=meta.get('rows_dropped_for_missing', 0),
                    missing_by_column=meta.get('missing_by_column', {}),
                    dtype_inference=meta.get('dtype_inference', {}),
                    date_columns_standardized=meta.get('date_columns_standardized', []),
                    notes=meta.get('notes', []),
                    header_row_detected=meta.get('header_row_detected'),
                    header_quality_score=meta.get('header_quality_score')
                ),
                sources=[schemas.DatasetSource(
                    source_id=source.id,
                    original_filename=file.filename,
                    upload_date=source.upload_date,
                    rows_contributed=len(cleaned_df),
                    cols_contributed=len(cleaned_df.columns),
                    merge_strategy='keep_separate'
                )],
                merge_summary=f"Created separate dataset '{new_dataset.name}'"
            )
        
        else:
            # Merge with existing dataset
            merged_df, merge_metadata = perform_merge_operation(
                dataset_id=dataset_id,
                new_df=cleaned_df,
                merge_strategy=merge_strategy,
                merge_column=merge_column,
                join_type=join_type,
                prefix_conflicting_columns=prefix_conflicting_columns
            )
            
            # Update dataset with merged data
            updated_dataset = update_dataset_with_merge(
                db=db,
                dataset_id=dataset_id,
                merged_df=merged_df,
                merge_metadata=merge_metadata,
                source_filename=file.filename
            )
            
            # Get all sources for response
            sources = db.query(models.DatasetSource).filter(models.DatasetSource.dataset_id == dataset_id).all()
            source_schemas = [
                schemas.DatasetSource(
                    source_id=s.id,
                    original_filename=s.original_filename,
                    upload_date=s.upload_date,
                    rows_contributed=s.rows_contributed,
                    cols_contributed=s.cols_contributed,
                    merge_strategy=s.merge_strategy,
                    merge_column=s.merge_column
                ) for s in sources
            ]
            
            preview_rows = merged_df.head(10).to_dict(orient='records')
            return schemas.MultiUploadResponse(
                dataset_id=dataset_id,
                merge_strategy=merge_strategy,
                rows_added=merge_metadata.get('rows_added', len(cleaned_df)),
                cols_added=len(merged_df.columns) - merge_metadata.get('columns_before', 0),
                total_rows=len(merged_df),
                total_cols=len(merged_df.columns),
                preview=schemas.PreviewBlock(
                    columns=merged_df.columns.tolist(),
                    rows=preview_rows,
                    total_rows=len(merged_df),
                    offset=0,
                    limit=10
                ),
                report=schemas.ReportBlock(
                    duplicates_removed=meta.get('duplicates_removed', 0),
                    rows_dropped_for_missing=meta.get('rows_dropped_for_missing', 0),
                    missing_by_column=meta.get('missing_by_column', {}),
                    dtype_inference=meta.get('dtype_inference', {}),
                    date_columns_standardized=meta.get('date_columns_standardized', []),
                    notes=meta.get('notes', []),
                    header_row_detected=meta.get('header_row_detected'),
                    header_quality_score=meta.get('header_quality_score')
                ),
                sources=source_schemas,
                merge_summary=f"Merged using {merge_strategy} strategy" + (f" on column '{merge_column}'" if merge_column else "")
            )
            
    except MergeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception(f"Multi-upload failed for dataset {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")


@router.get('/dataset/{dataset_id}/merge-info')
def get_merge_info(dataset_id: int, db: Session = Depends(get_db)):
    """Get information about possible merge options for a dataset."""
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    try:
        # Get current columns
        table_name = cleaned_table_name(dataset_id)
        current_df = pd.read_sql_table(table_name, con=engine)
        
        # Get sources information
        sources = db.query(models.DatasetSource).filter(models.DatasetSource.dataset_id == dataset_id).all()
        source_info = [
            {
                "source_id": s.id,
                "filename": s.original_filename,
                "upload_date": s.upload_date,
                "rows": s.rows_contributed,
                "cols": s.cols_contributed,
                "strategy": s.merge_strategy,
                "merge_column": s.merge_column
            } for s in sources
        ]
        
        return {
            "dataset_id": dataset_id,
            "current_columns": current_df.columns.tolist(),
            "current_rows": len(current_df),
            "current_cols": len(current_df.columns),
            "is_multi_source": dataset.is_multi_source,
            "source_count": dataset.source_count,
            "sources": source_info,
            "merge_history": json.loads(dataset.merge_history or '[]')
        }
        
    except Exception as e:
        logger.error(f"Failed to get merge info for dataset {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get merge info: {e}")


@router.post('/dataset/{dataset_id}/preview-merge')
async def preview_merge_operation(
    dataset_id: int,
    file: UploadFile = File(...),
    merge_strategy: str = Form(...),
    merge_column: Optional[str] = Form(None),
    join_type: str = Form('outer'),
    db: Session = Depends(get_db)
):
    """Preview what a merge operation would look like without actually performing it."""
    
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    _validate_extension(file.filename)
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=400, detail="File too large")
    
    try:
        # Read new data
        df_raw = read_file_to_df(file.filename, content)
        cleaned_df, _ = run_cleaning_pipeline(df_raw, CleaningConfig())
        
        # Get column analysis
        merge_analysis = get_available_merge_columns(dataset_id, cleaned_df)
        
        # Preview merge result
        if merge_strategy in ['append_below', 'merge_on_column']:
            try:
                merged_df, merge_metadata = perform_merge_operation(
                    dataset_id=dataset_id,
                    new_df=cleaned_df,
                    merge_strategy=merge_strategy,
                    merge_column=merge_column,
                    join_type=join_type
                )
                
                preview_rows = merged_df.head(5).to_dict(orient='records')
                success = True
                error_message = None
                
            except Exception as e:
                merged_df = None
                merge_metadata = {}
                preview_rows = []
                success = False
                error_message = str(e)
        else:
            # Keep separate doesn't need preview
            preview_rows = cleaned_df.head(5).to_dict(orient='records')
            merge_metadata = {"strategy": "keep_separate"}
            success = True
            error_message = None
        
        return {
            "dataset_id": dataset_id,
            "merge_strategy": merge_strategy,
            "merge_column": merge_column,
            "success": success,
            "error_message": error_message,
            "column_analysis": merge_analysis,
            "new_data_shape": {"rows": len(cleaned_df), "cols": len(cleaned_df.columns)},
            "preview_rows": preview_rows,
            "merge_metadata": merge_metadata,
            "estimated_result_shape": {
                "rows": len(merged_df) if merged_df is not None else len(cleaned_df),
                "cols": len(merged_df.columns) if merged_df is not None else len(cleaned_df.columns)
            } if success else None
        }
        
    except Exception as e:
        logger.error(f"Preview merge failed for dataset {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Preview failed: {e}")


@router.get('/dataset/{dataset_id}/related')
def get_related_datasets(dataset_id: int, db: Session = Depends(get_db)):
    """Get datasets related to this one (created from this one or vice versa)."""
    try:
        # Find datasets that were created from this one (using keep_separate)
        related_as_parent = db.query(models.Dataset).join(
            models.DatasetSource, models.Dataset.id == models.DatasetSource.dataset_id
        ).filter(
            models.DatasetSource.merge_strategy == 'keep_separate',
            models.Dataset.id != dataset_id  # Exclude the current dataset
        ).all()
        
        # Find the source dataset if this one was created with keep_separate
        current_dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
        if not current_dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
            
        related_as_child = []
        # Check if this dataset has sources indicating it was created from another
        sources = db.query(models.DatasetSource).filter(
            models.DatasetSource.dataset_id == dataset_id,
            models.DatasetSource.merge_strategy == 'keep_separate'
        ).all()
        
        if sources:
            # This dataset was created from others, but we don't store parent relationships directly
            # For now, we'll just return the related datasets we found
            pass
            
        # Also find datasets with similar names (heuristic for related datasets)
        base_name = current_dataset.name.split(' - ')[0]  # Remove filename suffix
        similar_datasets = db.query(models.Dataset).filter(
            models.Dataset.name.like(f"{base_name}%"),
            models.Dataset.id != dataset_id
        ).all()
        
        # Combine and deduplicate
        all_related = {}
        
        for dataset in related_as_parent:
            all_related[dataset.id] = {
                "id": dataset.id,
                "name": dataset.name,
                "original_filename": dataset.original_filename,
                "rows_clean": dataset.n_rows_clean,
                "cols_clean": dataset.n_cols_clean,
                "relationship": "Created from this dataset",
                "source_dataset_id": dataset_id
            }
            
        for dataset in similar_datasets:
            if dataset.id not in all_related:
                all_related[dataset.id] = {
                    "id": dataset.id,
                    "name": dataset.name,
                    "original_filename": dataset.original_filename,
                    "rows_clean": dataset.n_rows_clean,
                    "cols_clean": dataset.n_cols_clean,
                    "relationship": "Related dataset",
                    "source_dataset_id": None
                }
        
        return list(all_related.values())
        
    except Exception as e:
        logger.error(f"Error fetching related datasets: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch related datasets: {e}")


@router.post('/preview-file')
async def preview_file(file: UploadFile = File(...)):
    """Preview a file before uploading - shows cleaned data and processing summary."""
    try:
        _validate_extension(file.filename)
        
        if file.size > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large. Max size is {MAX_UPLOAD_SIZE / 1024 / 1024:.1f} MB")
        
        # Read and process the file
        content = await file.read()
        df_raw = read_file_to_df(content, file.filename)
        
        # Apply cleaning pipeline
        cfg_obj = CleaningConfig()  # Use default settings
        cleaned_df, meta = run_cleaning_pipeline(df_raw, cfg_obj)
        
        # Prepare preview
        preview_rows = cleaned_df.head(10).to_dict(orient='records')
        
        return {
            "preview": {
                "columns": cleaned_df.columns.tolist(),
                "rows": preview_rows,
                "total_rows": len(cleaned_df)
            },
            "report": {
                "duplicates_removed": meta.get('duplicates_removed', 0),
                "rows_dropped_for_missing": meta.get('rows_dropped_for_missing', 0),
                "missing_by_column": meta.get('missing_by_column', {}),
                "dtype_inference": meta.get('dtype_inference', {}),
                "date_columns_standardized": meta.get('date_columns_standardized', []),
                "notes": meta.get('notes', []),
                "header_row_detected": meta.get('header_row_detected'),
                "header_quality_score": meta.get('header_quality_score')
            }
        }
        
    except Exception as e:
        logger.error(f"File preview error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to preview file: {e}")


# Optional health alias per spec
@router.get('/healthz')
def healthz():
    return {"status": "ok"}

# Single-operation endpoints for the data editor
@router.post('/dataset/{dataset_id}/update-cell')
def update_single_cell(dataset_id: int, request: dict, db: Session = Depends(get_db)):
    """Update a single cell in the dataset."""
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Extract parameters
    row_id = request.get('row_id')
    column_name = request.get('column_name')
    new_value = request.get('new_value')
    
    if row_id is None or not column_name:
        raise HTTPException(status_code=400, detail="row_id and column_name are required")
    
    table = cleaned_table_name(dataset_id)
    
    with engine.begin() as conn:
        # Check if column exists
        existing_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
        if column_name not in existing_cols:
            raise HTTPException(status_code=400, detail=f"Column {column_name} does not exist")
        
        # Update the cell
        col_q = qi(column_name)
        conn.exec_driver_sql(
            f"UPDATE {table} SET {col_q} = :val WHERE rowid = :rid",
            {"val": new_value, "rid": row_id}
        )
    
    # Log the operation
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                {"d": dataset_id, "a": "edit_cell", "p": json.dumps({"row_id": row_id, "column": column_name, "value": new_value}), "c": datetime.utcnow()}
            )
            _snapshot_table(dataset_id, conn, table)
    except Exception as e:
        logger.warning("Failed logging/snapshot edit_cell: %s", e)
    
    return {"status": "updated"}


@router.post('/dataset/{dataset_id}/add-row')
def add_row(dataset_id: int, db: Session = Depends(get_db)):
    """Append an empty row to the cleaned table. Returns the new rowid if possible."""
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    table = cleaned_table_name(dataset_id)
    try:
        with engine.begin() as conn:
            # Insert a row with NULLs for all columns; use explicit column list
            cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
            if not cols:
                raise HTTPException(status_code=500, detail="No columns found for table")
            col_list = ','.join([qi(c) for c in cols])
            placeholders = ','.join(['NULL' for _ in cols])
            conn.exec_driver_sql(f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})")
            new_rowid = conn.exec_driver_sql("SELECT last_insert_rowid()").scalar()
            # update dataset stats
            dataset.n_rows_clean = dataset.n_rows_clean + 1
            db.add(dataset)
            db.commit()
            conn.exec_driver_sql("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                                 {"d": dataset_id, "a": "add_row", "p": json.dumps({}), "c": datetime.utcnow()})
            _snapshot_table(dataset_id, conn, table)
        return {"status": "ok", "rowid": new_rowid}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to add row: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to add row: {e}")


@router.post('/dataset/{dataset_id}/add-column')
def add_column(dataset_id: int, payload: dict, db: Session = Depends(get_db)):
    """Add a new column with the supplied name (NULL values). Payload: { column_name: str }"""
    name = payload.get('column_name')
    if not name:
        raise HTTPException(status_code=400, detail="column_name required")
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    table = cleaned_table_name(dataset_id)
    try:
        with engine.begin() as conn:
            # basic validation: ensure column doesn't already exist
            existing = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
            if name in existing:
                raise HTTPException(status_code=400, detail="Column already exists")
            # Add as TEXT (safe default)
            conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {qi(name)} TEXT")
            dataset.n_cols_clean = dataset.n_cols_clean + 1
            db.add(dataset)
            db.commit()
            conn.exec_driver_sql("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                                 {"d": dataset_id, "a": "add_column", "p": json.dumps({"column": name}), "c": datetime.utcnow()})
            _snapshot_table(dataset_id, conn, table)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to add column: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to add column: {e}")


@router.post('/dataset/{dataset_id}/drop-column')
def drop_column(dataset_id: int, payload: dict, db: Session = Depends(get_db)):
    """Drop a column from the cleaned table. Payload: { column_name: str }"""
    name = payload.get('column_name')
    if not name:
        raise HTTPException(status_code=400, detail="column_name required")
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    table = cleaned_table_name(dataset_id)
    try:
        with engine.begin() as conn:
            existing = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
            if name not in existing:
                raise HTTPException(status_code=400, detail="Column does not exist")
            # SQLite doesn't support DROP COLUMN directly for older versions; use rebuild table strategy
            remaining = [c for c in existing if c != name]
            cols_q = ','.join([qi(c) for c in remaining])
            tmp = f"tmp_drop_{dataset_id}_{int(time.time())}"
            conn.exec_driver_sql(f"CREATE TABLE {tmp} AS SELECT {cols_q} FROM {table}")
            conn.exec_driver_sql(f"DROP TABLE {table}")
            conn.exec_driver_sql(f"ALTER TABLE {tmp} RENAME TO {table}")
            dataset.n_cols_clean = len(remaining)
            db.add(dataset)
            db.commit()
            conn.exec_driver_sql("INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                                 {"d": dataset_id, "a": "drop_column", "p": json.dumps({"column": name}), "c": datetime.utcnow()})
            _snapshot_table(dataset_id, conn, table)
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed dropping column: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed dropping column: {e}")

@router.post('/dataset/{dataset_id}/rename-column')
def rename_single_column(dataset_id: int, request: dict, db: Session = Depends(get_db)):
    """Rename a single column in the dataset."""
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    # Extract parameters
    old_column_name = request.get('old_column_name')
    new_column_name = request.get('new_column_name')
    
    if not old_column_name or not new_column_name:
        raise HTTPException(status_code=400, detail="old_column_name and new_column_name are required")
    
    table = cleaned_table_name(dataset_id)
    
    with engine.begin() as conn:
        # Check if old column exists and new column doesn't
        existing_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()]
        if old_column_name not in existing_cols:
            raise HTTPException(status_code=400, detail=f"Column {old_column_name} does not exist")
        if new_column_name in existing_cols:
            raise HTTPException(status_code=400, detail=f"Column {new_column_name} already exists")
        
        # Rename the column
        try:
            conn.exec_driver_sql(f'ALTER TABLE {table} RENAME COLUMN {qi(old_column_name)} TO {qi(new_column_name)}')
            
            # Also rename in backup table if it exists
            backup_table = f"num_backup_{dataset_id}"
            try:
                exists_backup = conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table' AND name = :n", {"n": backup_table}).fetchone()
                if exists_backup:
                    backup_cols = [row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({backup_table})").fetchall()]
                    if old_column_name in backup_cols and new_column_name not in backup_cols:
                        conn.exec_driver_sql(f'ALTER TABLE {backup_table} RENAME COLUMN {qi(old_column_name)} TO {qi(new_column_name)}')
            except Exception as be:
                logger.warning("Failed renaming column in backup %s: %s", backup_table, be)
                
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed renaming {old_column_name} -> {new_column_name}: {e}")
    
    # Update dataset timestamp
    dataset.updated_at = datetime.utcnow()
    db.add(dataset)
    db.commit()
    
    # Log the operation
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "INSERT INTO operation_logs (dataset_id, action_type, params_json, created_at) VALUES (:d,:a,:p,:c)",
                {"d": dataset_id, "a": "rename_column", "p": json.dumps({"old": old_column_name, "new": new_column_name}), "c": datetime.utcnow()}
            )
            _snapshot_table(dataset_id, conn, table)
    except Exception as e:
        logger.warning("Failed logging/snapshot rename_column: %s", e)
    
    return {"status": "renamed"}

@router.post('/admin/reset')
def admin_reset(full: bool = False):
    """Clear all stored data. If full=true delete file (recreate), else drop tables only."""
    full_reset(delete_file=full)
    return {"status": "reset", "mode": "file" if full else "tables"}

@router.post('/admin/integrity')
def admin_integrity():
    return integrity_check()
