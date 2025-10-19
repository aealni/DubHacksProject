from __future__ import annotations
from typing import Dict, Any
import pandas as pd
import numpy as np


def profile_columns(df: pd.DataFrame) -> Dict[str, Any]:
    """Generate lightweight profiling statistics for each column.

    Returns a dict keyed by column name with:
      - dtype: inferred semantic dtype (numeric|categorical|date)
      - non_nulls
      - nulls
      - distinct
      - sample_values (up to 5 representative non-null values)
      - min/max/mean/std for numeric
      - min/max (lexicographical) for categorical/text
    """
    result: Dict[str, Any] = {}
    for col in df.columns:
        s = df[col]
        col_info: Dict[str, Any] = {}
        non_null = s.notna().sum()
        col_info['non_nulls'] = int(non_null)
        col_info['nulls'] = int(len(s) - non_null)
        col_info['distinct'] = int(s.nunique(dropna=True))

        # Determine semantic dtype
        semantic = None
        if pd.api.types.is_numeric_dtype(s):
            semantic = 'numeric'
        else:
            # try parse date sample
            if s.dtype == object:
                sample = s.dropna().head(20)
                if not sample.empty:
                    parsed = pd.to_datetime(sample, errors='coerce', infer_datetime_format=True)
                    if parsed.notna().mean() > 0.8:
                        semantic = 'date'
            if semantic is None:
                semantic = 'categorical'
        col_info['dtype'] = semantic

        sample_vals = s.dropna().unique()[:5]
        col_info['sample_values'] = [str(v) for v in sample_vals]

        if semantic == 'numeric':
            numeric = s.astype(float)
            col_info['min'] = float(np.nanmin(numeric)) if non_null else None
            col_info['max'] = float(np.nanmax(numeric)) if non_null else None
            col_info['mean'] = float(np.nanmean(numeric)) if non_null else None
            col_info['std'] = float(np.nanstd(numeric)) if non_null else None
        elif semantic == 'date':
            # provide min/max date after parsing
            parsed_full = pd.to_datetime(s, errors='coerce')
            if parsed_full.notna().any():
                col_info['min'] = str(parsed_full.min().date())
                col_info['max'] = str(parsed_full.max().date())
        else:
            # categorical/text min/max (lexicographic) maybe useful
            if non_null:
                non_null_series = s.dropna().astype(str)
                try:
                    col_info['min'] = min(non_null_series)
                    col_info['max'] = max(non_null_series)
                except ValueError:
                    col_info['min'] = None
                    col_info['max'] = None

        result[col] = col_info
    return result
