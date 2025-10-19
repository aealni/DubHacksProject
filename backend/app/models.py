from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON

from .db import Base


class Dataset(Base):
    __tablename__ = "datasets"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    original_filename = Column(String)
    raw_file_path = Column(String, nullable=True)
    n_rows_raw = Column(Integer)
    n_cols_raw = Column(Integer)
    n_rows_clean = Column(Integer)
    n_cols_clean = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_deleted = Column(Boolean, default=False)
    pipeline_json = Column(Text, default='[]')  # store list of applied steps as JSON string
    options_json = Column(Text, default='{}')  # persisted cleaning config used for this dataset
    # Multi-source support
    is_multi_source = Column(Boolean, default=False)
    source_count = Column(Integer, default=1)
    merge_history = Column(Text, default='[]')  # JSON array of merge operations

    cleaning_report = relationship("CleaningReport", back_populates="dataset", uselist=False)
    sources = relationship("DatasetSource", back_populates="dataset", cascade="all, delete-orphan")


class DatasetSource(Base):
    __tablename__ = "dataset_sources"

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    original_filename = Column(String)
    upload_date = Column(DateTime, default=datetime.utcnow)
    rows_contributed = Column(Integer)
    cols_contributed = Column(Integer)
    merge_strategy = Column(String, nullable=True)  # 'append_below', 'merge_on_column', 'keep_separate'
    merge_column = Column(String, nullable=True)  # Column used for merge_on_column strategy
    source_order = Column(Integer, default=0)  # Order of upload for this dataset
    raw_table_name = Column(String, nullable=True)  # Name of raw table for this source

    dataset = relationship("Dataset", back_populates="sources")


class CleaningReport(Base):
    __tablename__ = "cleaning_reports"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), unique=True)
    summary_json = Column(Text)  # JSON string
    issues_json = Column(Text)   # JSON string
    created_at = Column(DateTime, default=datetime.utcnow)

    dataset = relationship("Dataset", back_populates="cleaning_report")


class OperationLog(Base):
    __tablename__ = "operation_logs"
    __mapper_args__ = {"confirm_deleted_rows": False}

    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id", ondelete="CASCADE"), index=True, nullable=False)
    action_type = Column(String, index=True)
    params_json = Column(Text)  # serialized JSON of parameters
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
