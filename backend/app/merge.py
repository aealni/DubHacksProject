"""
Data merging utilities for handling multiple uploads to datasets.

Supports three merge strategies:
1. append_below: Stack data vertically (concatenate)
2. merge_on_column: Join data horizontally on specified column
3. keep_separate: Create new dataset but track relationship
"""

import json
import logging
import pandas as pd
from typing import Tuple, Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from . import models
from .db import engine
from .cleaning import cleaned_table_name
from .pipeline import save_cleaned_to_sqlite

logger = logging.getLogger("udc.merge")


class MergeError(Exception):
    """Exception raised during merge operations."""
    pass


def append_below_merge(existing_df: pd.DataFrame, new_df: pd.DataFrame, 
                      prefix_conflicting_columns: bool = True) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Append new data below existing data (vertical concatenation).
    
    Args:
        existing_df: Current dataset DataFrame
        new_df: New data to append
        prefix_conflicting_columns: Whether to add prefixes to conflicting column names
    
    Returns:
        Tuple of (merged_df, merge_metadata)
    """
    try:
        # Handle column differences
        existing_cols = set(existing_df.columns)
        new_cols = set(new_df.columns)
        
        # Find missing columns in each dataset
        missing_in_new = existing_cols - new_cols
        missing_in_existing = new_cols - existing_cols
        
        merge_metadata = {
            "strategy": "append_below",
            "existing_columns": list(existing_cols),
            "new_columns": list(new_cols),
            "missing_in_new": list(missing_in_new),
            "missing_in_existing": list(missing_in_existing),
            "rows_before": len(existing_df),
            "rows_added": len(new_df)
        }
        
        # Add missing columns with NaN values
        for col in missing_in_new:
            new_df[col] = pd.NA
            
        for col in missing_in_existing:
            existing_df[col] = pd.NA
        
        # Reorder columns to match existing dataset
        all_columns = list(existing_df.columns) + [col for col in new_df.columns if col not in existing_df.columns]
        existing_df = existing_df.reindex(columns=all_columns)
        new_df = new_df.reindex(columns=all_columns)
        
        # Concatenate vertically
        merged_df = pd.concat([existing_df, new_df], ignore_index=True, sort=False)
        
        merge_metadata.update({
            "rows_after": len(merged_df),
            "columns_after": len(merged_df.columns),
            "success": True
        })
        
        logger.info(f"Append below merge completed: {len(existing_df)} + {len(new_df)} = {len(merged_df)} rows")
        return merged_df, merge_metadata
        
    except Exception as e:
        logger.error(f"Append below merge failed: {e}")
        raise MergeError(f"Failed to append data: {e}")


def merge_on_column_join(existing_df: pd.DataFrame, new_df: pd.DataFrame, 
                        merge_column: str, join_type: str = 'outer',
                        prefix_conflicting_columns: bool = True) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Merge data horizontally by joining on a specified column.
    
    Args:
        existing_df: Current dataset DataFrame
        new_df: New data to merge
        merge_column: Column to join on
        join_type: Type of join ('inner', 'left', 'right', 'outer')
        prefix_conflicting_columns: Whether to add prefixes to conflicting column names
    
    Returns:
        Tuple of (merged_df, merge_metadata)
    """
    try:
        # Validate merge column exists in both datasets
        if merge_column not in existing_df.columns:
            raise MergeError(f"Merge column '{merge_column}' not found in existing dataset")
        if merge_column not in new_df.columns:
            raise MergeError(f"Merge column '{merge_column}' not found in new dataset")
        
        existing_cols = set(existing_df.columns)
        new_cols = set(new_df.columns)
        conflicting_cols = (existing_cols & new_cols) - {merge_column}
        
        merge_metadata = {
            "strategy": "merge_on_column",
            "merge_column": merge_column,
            "join_type": join_type,
            "existing_columns": list(existing_cols),
            "new_columns": list(new_cols),
            "conflicting_columns": list(conflicting_cols),
            "rows_before_existing": len(existing_df),
            "rows_before_new": len(new_df)
        }
        
        # Handle conflicting column names
        if prefix_conflicting_columns and conflicting_cols:
            new_df_renamed = new_df.copy()
            rename_map = {}
            for col in conflicting_cols:
                new_name = f"new_{col}"
                rename_map[col] = new_name
            
            new_df_renamed = new_df_renamed.rename(columns=rename_map)
            merge_metadata["renamed_columns"] = rename_map
        else:
            new_df_renamed = new_df.copy()
        
        # Perform the merge
        merged_df = pd.merge(existing_df, new_df_renamed, on=merge_column, how=join_type, suffixes=('', '_new'))
        
        merge_metadata.update({
            "rows_after": len(merged_df),
            "columns_after": len(merged_df.columns),
            "success": True
        })
        
        logger.info(f"Column merge completed on '{merge_column}': {len(merged_df)} rows, {len(merged_df.columns)} columns")
        return merged_df, merge_metadata
        
    except Exception as e:
        logger.error(f"Column merge failed: {e}")
        raise MergeError(f"Failed to merge on column '{merge_column}': {e}")


def perform_merge_operation(dataset_id: int, new_df: pd.DataFrame, merge_strategy: str,
                          merge_column: Optional[str] = None, join_type: str = 'outer',
                          prefix_conflicting_columns: bool = True) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Perform a merge operation based on the specified strategy.
    
    Args:
        dataset_id: ID of existing dataset
        new_df: New DataFrame to merge
        merge_strategy: 'append_below', 'merge_on_column', or 'keep_separate'
        merge_column: Column to merge on (required for merge_on_column)
        join_type: Type of join for merge_on_column
        prefix_conflicting_columns: Whether to prefix conflicting columns
    
    Returns:
        Tuple of (merged_df, merge_metadata)
    """
    try:
        # Load existing dataset
        table_name = cleaned_table_name(dataset_id)
        existing_df = pd.read_sql_table(table_name, con=engine)
        
        if merge_strategy == 'append_below':
            return append_below_merge(existing_df, new_df, prefix_conflicting_columns)
        
        elif merge_strategy == 'merge_on_column':
            if not merge_column:
                raise MergeError("merge_column is required for merge_on_column strategy")
            return merge_on_column_join(existing_df, new_df, merge_column, join_type, prefix_conflicting_columns)
        
        elif merge_strategy == 'keep_separate':
            # For keep_separate, we don't actually merge - this would create a new dataset
            # But return the new data with metadata indicating it should be kept separate
            merge_metadata = {
                "strategy": "keep_separate",
                "message": "Data should be kept as separate dataset",
                "new_rows": len(new_df),
                "new_columns": list(new_df.columns)
            }
            return new_df, merge_metadata
        
        else:
            raise MergeError(f"Unknown merge strategy: {merge_strategy}")
            
    except Exception as e:
        logger.error(f"Merge operation failed for dataset {dataset_id}: {e}")
        raise MergeError(f"Merge operation failed: {e}")


def update_dataset_with_merge(db: Session, dataset_id: int, merged_df: pd.DataFrame, 
                             merge_metadata: Dict[str, Any], source_filename: str) -> models.Dataset:
    """
    Update dataset with merged data and create source tracking record.
    
    Args:
        db: Database session
        dataset_id: ID of dataset to update
        merged_df: Merged DataFrame
        merge_metadata: Metadata about the merge operation
        source_filename: Original filename of new data source
    
    Returns:
        Updated Dataset model
    """
    try:
        # Get existing dataset
        dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
        if not dataset:
            raise MergeError(f"Dataset {dataset_id} not found")
        
        # Update dataset metadata
        old_rows = dataset.n_rows_clean
        old_cols = dataset.n_cols_clean
        
        dataset.n_rows_clean = len(merged_df)
        dataset.n_cols_clean = len(merged_df.columns)
        dataset.is_multi_source = True
        dataset.source_count = (dataset.source_count or 1) + 1
        
        # Update merge history
        merge_history = json.loads(dataset.merge_history or '[]')
        merge_history.append({
            "timestamp": pd.Timestamp.now().isoformat(),
            "strategy": merge_metadata.get("strategy"),
            "source_filename": source_filename,
            "rows_before": old_rows,
            "rows_after": dataset.n_rows_clean,
            "cols_before": old_cols,
            "cols_after": dataset.n_cols_clean,
            "metadata": merge_metadata
        })
        dataset.merge_history = json.dumps(merge_history)
        
        # Save updated data to database
        save_cleaned_to_sqlite(merged_df, dataset_id, engine, if_exists='replace')
        
        # Create dataset source record
        source_order = db.query(models.DatasetSource).filter(
            models.DatasetSource.dataset_id == dataset_id
        ).count()
        
        dataset_source = models.DatasetSource(
            dataset_id=dataset_id,
            original_filename=source_filename,
            rows_contributed=merge_metadata.get("rows_added", len(merged_df)),
            cols_contributed=merge_metadata.get("cols_added", len(merged_df.columns)),
            merge_strategy=merge_metadata.get("strategy"),
            merge_column=merge_metadata.get("merge_column"),
            source_order=source_order + 1
        )
        
        db.add(dataset_source)
        db.commit()
        db.refresh(dataset)
        
        logger.info(f"Dataset {dataset_id} updated with merge from {source_filename}")
        return dataset
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update dataset {dataset_id} with merge: {e}")
        raise MergeError(f"Failed to update dataset: {e}")


def get_available_merge_columns(dataset_id: int, new_df: pd.DataFrame) -> Dict[str, List[str]]:
    """
    Get columns available for merging between existing dataset and new data.
    
    Args:
        dataset_id: ID of existing dataset
        new_df: New DataFrame to potentially merge
    
    Returns:
        Dict with 'common_columns', 'existing_only', 'new_only'
    """
    try:
        table_name = cleaned_table_name(dataset_id)
        existing_df = pd.read_sql_table(table_name, con=engine)
        
        existing_cols = set(existing_df.columns)
        new_cols = set(new_df.columns)
        
        return {
            "common_columns": list(existing_cols & new_cols),
            "existing_only": list(existing_cols - new_cols),
            "new_only": list(new_cols - existing_cols)
        }
        
    except Exception as e:
        logger.error(f"Failed to analyze merge columns for dataset {dataset_id}: {e}")
        raise MergeError(f"Failed to analyze merge columns: {e}")