from __future__ import annotations
from typing import Tuple, Dict, Any, List, Optional, Union
import pandas as pd
import numpy as np
from io import BytesIO
from .schemas import CleaningConfig


def cleaned_table_name(dataset_id: int) -> str:
    return f"cleaned_{dataset_id}"  # simple helper


def detect_header_and_read(path_or_bytes: Union[bytes, str], delimiter: Optional[str] = None) -> pd.DataFrame:
    """Simplified reader: always treat first row as header.

    Previous heuristic sometimes mis-identified a data row as the header when
    the first data line had more distinct tokens than the real header, producing
    'broken' column names (e.g. first data row values becoming headers).
    This simplified version favors correctness for standard CSV/Excel files.
    """
    if isinstance(path_or_bytes, bytes):
        bio = BytesIO(path_or_bytes)
        # Peek to decide excel vs csv
        peek = bio.read(4)
        bio.seek(0)
        # XLSX files start with PK (zip)
        if peek.startswith(b'PK'):
            return pd.read_excel(bio)
        sep = None if delimiter in (None, '') else delimiter
        return pd.read_csv(bio, header=0, sep=sep)
    lower = str(path_or_bytes).lower()
    if lower.endswith('.csv') or lower.endswith('.tsv') or lower.endswith('.txt'):
        sep = None if delimiter in (None, '') else delimiter
        return pd.read_csv(path_or_bytes, header=0, sep=sep)
    if lower.endswith('.xlsx') or lower.endswith('.xls'):
        return pd.read_excel(path_or_bytes)
    raise ValueError("Unsupported file type. Only CSV/XLSX supported.")


def simple_header_heuristic(df: pd.DataFrame) -> dict:
    """Return heuristic info about header detection.

    Currently we always treat first row as header; heuristic collects whether
    header tokens look 'field-like' (few numeric only cells) and length stats.
    """
    if df.empty:
        return {"header_row_detected": 0, "header_quality_score": 0.0}
    header = list(df.columns)
    total = len(header)
    alnum = sum(1 for h in header if any(c.isalpha() for c in str(h)))
    numeric_like = sum(1 for h in header if str(h).isdigit())
    quality = 0.0
    if total:
        quality = (alnum - numeric_like) / total
    return {
        "header_row_detected": 0,
        "header_quality_score": round(quality, 3)
    }


def standardize_column_names(df: pd.DataFrame, lowercase: bool = True) -> pd.DataFrame:
    seen = {}
    new_cols = []
    for c in df.columns:
        base = str(c).strip()
        base = ' '.join(base.split())
        if lowercase:
            base = base.lower()
        if base == '':
            base = 'unnamed'
        if base in seen:
            seen[base] += 1
            base = f"{base}_{seen[base]}"
        else:
            seen[base] = 0
        new_cols.append(base)
    df.columns = new_cols
    return df


def infer_and_cast_dtypes(df: pd.DataFrame, date_cols: Optional[List[str]] = None) -> Tuple[pd.DataFrame, Dict[str, str], List[str]]:
    dtype_map: Dict[str, str] = {}
    date_standardized: List[str] = []
    for col in df.columns:
        series = df[col]
        # Explicit user-declared date columns OR heuristic detection
        should_attempt_date = False
        if date_cols and col in date_cols:
            should_attempt_date = True
        else:
            # Heuristic: if object dtype and at least 60% of non-null values parse as date
            if series.dtype == object:
                sample = series.dropna().astype(str).head(200)
                if not sample.empty:
                    parsed = pd.to_datetime(sample, errors='coerce')
                    if parsed.notna().mean() >= 0.6:
                        should_attempt_date = True
        if should_attempt_date:
            parsed_full = pd.to_datetime(series, errors='coerce')
            if parsed_full.notna().any():
                # Store ISO date (date only if time all midnight, else full ISO)
                if parsed_full.dt.time.eq(pd.Timestamp('1970-01-01').time()).all():
                    df[col] = parsed_full.dt.date.astype(str)
                else:
                    df[col] = parsed_full.dt.strftime('%Y-%m-%dT%H:%M:%S')
                dtype_map[col] = 'date'
                date_standardized.append(col)
                continue
        if series.dtype == object:
            numeric_conv = pd.to_numeric(series, errors='coerce')
            if numeric_conv.notna().mean() > 0.9:
                df[col] = numeric_conv
                dtype_map[col] = 'numeric'
                continue
        if pd.api.types.is_numeric_dtype(df[col]):
            dtype_map[col] = 'numeric'
        else:
            dtype_map[col] = 'categorical'
    return df, dtype_map, date_standardized


def handle_missing_values(df: pd.DataFrame, cfg: CleaningConfig) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    info: Dict[str, Any] = {}
    missing_before = {c: int(df[c].isna().sum()) for c in df.columns}

    rows_dropped = 0
    if cfg.missing_mode == 'drop_rows':
        row_missing_fraction = df.isna().mean(axis=1)
        to_drop = row_missing_fraction > cfg.drop_row_missing_threshold
        rows_dropped = int(to_drop.sum())
        if rows_dropped:
            df = df.loc[~to_drop].reset_index(drop=True)
    info['rows_dropped_for_missing'] = rows_dropped

    if cfg.missing_mode == 'impute_mean':
        # Only mean for numeric, leave categoricals untouched for now (explicit)
        for col in df.columns:
            s = df[col]
            if pd.api.types.is_numeric_dtype(s):
                mean_val = s.mean()
                df[col] = s.fillna(mean_val)
    elif cfg.missing_mode == 'drop_rows':
        # After row drop, still fill remaining per original strategy
        for col in df.columns:
            s = df[col]
            if pd.api.types.is_numeric_dtype(s):
                if cfg.numeric_fill == 'median':
                    fill_val = s.median()
                elif cfg.numeric_fill == 'mean':
                    fill_val = s.mean()
                else:
                    fill_val = 0
                df[col] = s.fillna(fill_val)
            else:
                if cfg.categorical_fill == 'mode':
                    mode_val = s.mode(dropna=True)
                    fill_val = mode_val.iloc[0] if not mode_val.empty else ''
                else:
                    fill_val = cfg.constant_fill_value if cfg.constant_fill_value is not None else ''
                df[col] = s.fillna(fill_val)
    # leave mode -> no filling

    missing_after = {c: int(df[c].isna().sum()) for c in df.columns}
    info['missing_by_column'] = {c: {'before': missing_before[c], 'after': missing_after[c]} for c in df.columns}
    info['missing_mode'] = cfg.missing_mode
    return df, info


def remove_duplicates(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    dup_count = int(df.duplicated().sum())
    if dup_count:
        df = df.drop_duplicates().reset_index(drop=True)
    return df, dup_count


def normalize_categoricals(df: pd.DataFrame, lowercase: bool) -> pd.DataFrame:
    for col in df.columns:
        if pd.api.types.is_object_dtype(df[col]):
            series = df[col].astype(str).str.strip().str.replace(r'\s+', ' ', regex=True)
            if lowercase:
                series = series.str.lower()
            df[col] = series
    return df


def run_cleaning_pipeline(df_raw: pd.DataFrame, cfg: CleaningConfig) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Execute cleaning steps returning cleaned df and a raw metadata dict (pre-report shaping)."""
    metadata: Dict[str, Any] = {}
    rows_before, cols_before = df_raw.shape
    metadata['rows_before'] = rows_before
    metadata['cols_before'] = cols_before

    df = df_raw.copy()
    # Standardize obvious placeholder strings to NaN (case-insensitive)
    df = df.replace({r'(?i)^(nan)$': np.nan, r'(?i)^(none)$': np.nan}, regex=True)

    # Heuristic noise row removal (instruction/command rows or banner-like lines)
    noise_patterns = [r'^#', r'^pip ', r'^uvicorn ', r'^cd ', r'^python ', r'^py -']
    def _is_noise_row(row: pd.Series) -> bool:
        non_null = row.dropna().astype(str)
        if non_null.empty:
            return True
        if len(set(non_null)) == 1 and len(list(non_null)[0]) > 25:
            return True
        # Require some sparsity plus a pattern token
        empty_frac = row.isna().mean()
        if empty_frac > 0.4:
            for pat in noise_patterns:
                if non_null.str.contains(pat, regex=True, case=False, na=False).any():
                    return True
        return False

    if len(df) <= 1000:  # safeguard for very large datasets
        noise_mask = df.apply(_is_noise_row, axis=1)
        # Always keep first row (header already separated at read time, but be safe)
        if len(noise_mask) > 0:
            noise_mask.iloc[0] = False
        noise_removed = int(noise_mask.sum())
        if noise_removed:
            df = df.loc[~noise_mask].reset_index(drop=True)
        metadata['noise_rows_removed'] = noise_removed
    else:
        metadata['noise_rows_removed'] = 0

    # Remove trailing mostly empty rows (>80% NaN)
    trailing_drop = 0
    while len(df) > 0 and df.iloc[-1].isna().mean() > 0.8:
        df = df.iloc[:-1]
        trailing_drop += 1
    if trailing_drop:
        df = df.reset_index(drop=True)
    metadata['trailing_empty_rows_removed'] = trailing_drop

    df = standardize_column_names(df, lowercase=cfg.lowercase_categoricals)
    header_meta = simple_header_heuristic(df)

    # Collapse duplicate columns with identical content
    cols_to_drop: List[str] = []
    for i, col in enumerate(df.columns):
        if col in cols_to_drop:
            continue
        for other in df.columns[i+1:]:
            if other in cols_to_drop:
                continue
            if df[col].equals(df[other]):
                cols_to_drop.append(other)
    if cols_to_drop:
        df = df.drop(columns=cols_to_drop)
    metadata['duplicate_columns_removed'] = cols_to_drop

    df, dtypes_map, date_cols_std = infer_and_cast_dtypes(df, cfg.date_cols)
    df = normalize_categoricals(df, lowercase=cfg.lowercase_categoricals)

    df, dup_removed = remove_duplicates(df)
    metadata['duplicates_removed'] = dup_removed

    df, missing_info = handle_missing_values(df, cfg)
    metadata.update(missing_info)
    metadata['dtype_inference'] = dtypes_map
    metadata['date_columns_standardized'] = date_cols_std

    rows_after, cols_after = df.shape
    metadata['rows_after'] = rows_after
    metadata['cols_after'] = cols_after
    # Build notes list (ordered summary of transformations)
    notes: List[str] = []
    notes.append("standardized column names")
    if metadata.get('noise_rows_removed'):
        notes.append(f"removed {metadata['noise_rows_removed']} noise rows")
    if metadata.get('trailing_empty_rows_removed'):
        notes.append(f"removed {metadata['trailing_empty_rows_removed']} trailing empty rows")
    if metadata.get('duplicate_columns_removed'):
        notes.append(f"dropped duplicate columns: {', '.join(metadata['duplicate_columns_removed'])}")
    if metadata.get('duplicates_removed'):
        notes.append(f"removed {metadata['duplicates_removed']} duplicate rows")
    if metadata.get('rows_dropped_for_missing'):
        notes.append(f"dropped {metadata['rows_dropped_for_missing']} rows exceeding missing threshold")
    if metadata.get('date_columns_standardized'):
        notes.append(f"standardized date columns: {', '.join(metadata['date_columns_standardized'])}")
    metadata['notes'] = notes
    metadata.update(header_meta)
    return df, metadata

# Backwards compatibility wrappers (if older code still imports them)
def read_file_to_df(filename: str, content: bytes, delimiter: Optional[str] = None) -> pd.DataFrame:
    return detect_header_and_read(content, delimiter=delimiter)

def clean_dataframe(df: pd.DataFrame, config: Optional[CleaningConfig] = None):  # deprecated
    cfg = config or CleaningConfig()
    cleaned, meta = run_cleaning_pipeline(df, cfg)
    return cleaned, meta, {}
