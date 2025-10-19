from datetime import datetime
from typing import List, Dict, Any, Literal, Optional, Union
from pydantic import BaseModel


class DatasetBasic(BaseModel):
    id: int
    name: str
    original_filename: str
    n_rows_raw: int
    n_cols_raw: int
    n_rows_clean: int
    n_cols_clean: int
    created_at: datetime

    class Config:
        from_attributes = True


class CleaningConfig(BaseModel):
    """Internal cleaning configuration.

    Exposed partially via query params (drop_row_missing_pct, lowercase_categoricals)
    but we keep additional knobs for future extensibility.
    """
    drop_row_missing_threshold: float = 0.6
    numeric_fill: Literal["median", "mean", "zero"] = "median"
    categorical_fill: Literal["mode", "constant"] = "mode"
    constant_fill_value: Optional[str] = None
    lowercase_categoricals: bool = True
    date_cols: Optional[List[str]] = None
    missing_mode: Literal['drop_rows', 'impute_mean', 'leave'] = 'drop_rows'
    # Time formatting preferences (applied during pipeline when date_cols provided)
    time_format: Optional[str] = None  # e.g. '%Y-%m-%d', '%Y-%m-%d %H:%M:%S', 'iso', 'date', 'epoch_ms'

class TimeFormatSpec(BaseModel):
    columns: List[str]
    format: str  # same accepted values as CleaningConfig.time_format

class TimeFormatResponse(BaseModel):
    formatted: int
    format: str
    columns: List[str]


# Mutation request batches used by dataset router
class CellEdit(BaseModel):
    rowid: int
    column: str
    value: Any

class CellEditBatch(BaseModel):
    edits: List[CellEdit]

class CellEditResponse(BaseModel):
    updated: int

class ColumnRename(BaseModel):
    old: str
    new: str

class ColumnRenameBatch(BaseModel):
    renames: List[ColumnRename]

class RoundSpec(BaseModel):
    column: str
    decimals: int

class RoundBatch(BaseModel):
    rounds: List[RoundSpec]

class ImputeSpec(BaseModel):
    column: str
    strategy: Literal['mean','median','zero','mode','constant']
    constant: Optional[str] = None

class ImputeBatch(BaseModel):
    imputations: List[ImputeSpec]


# Multi-upload and merge schemas
class MergeMode(BaseModel):
    """Configuration for how to merge new data with existing dataset."""
    strategy: Literal['append_below', 'merge_on_column', 'keep_separate']
    merge_column: Optional[str] = None  # Required for merge_on_column
    join_type: Optional[Literal['inner', 'left', 'right', 'outer']] = 'outer'  # For merge_on_column
    prefix_conflicting_columns: bool = True  # Add prefixes to conflicting column names


class AdditionalUploadRequest(BaseModel):
    """Request for uploading additional data to existing dataset."""
    merge_config: MergeMode
    drop_row_missing_pct: float = 0.6
    lowercase_categoricals: bool = True
    missing_mode: str = 'drop_rows'
    config: Optional[str] = None


class DatasetSource(BaseModel):
    """Information about a data source within a dataset."""
    source_id: int
    original_filename: str
    upload_date: datetime
    rows_contributed: int
    cols_contributed: int
    merge_strategy: Optional[str] = None
    merge_column: Optional[str] = None


class PreviewBlock(BaseModel):
    columns: List[str]
    rows: List[Dict[str, Any]]
    total_rows: Optional[int] = None  # optional for paginated preview
    offset: Optional[int] = None
    limit: Optional[int] = None


class ReportBlock(BaseModel):
    duplicates_removed: int
    rows_dropped_for_missing: int
    missing_by_column: Dict[str, Dict[str, Union[int, Any]]]
    dtype_inference: Dict[str, str]
    date_columns_standardized: List[str]
    notes: List[str]
    # Future heuristic fields (header/junk detection) reserved for Sprint 1
    # header_row_detected: Optional[int] = None
    # junk_rows_removed: Optional[int] = None
    header_row_detected: Optional[int] = None
    header_quality_score: Optional[float] = None


class UploadResponse(BaseModel):
    dataset_id: int
    name: str
    rows_raw: int
    cols_raw: int
    rows_clean: int
    cols_clean: int
    preview: PreviewBlock
    report: ReportBlock
    sources: Optional[List[DatasetSource]] = None  # For multi-source datasets
    merge_summary: Optional[str] = None  # Summary of merge operation


class MultiUploadResponse(BaseModel):
    """Response for additional uploads to existing datasets."""
    dataset_id: int
    merge_strategy: str
    rows_added: int
    cols_added: int
    total_rows: int
    total_cols: int
    preview: PreviewBlock
    report: ReportBlock
    sources: List[DatasetSource]
    merge_summary: str

class PreviewResponse(BaseModel):
    preview: PreviewBlock


class MetadataResponse(BaseModel):
    report: ReportBlock


class DatasetListItem(BaseModel):
    id: int
    name: str
    original_filename: str
    rows_raw: int
    cols_raw: int
    rows_clean: int
    cols_clean: int
    created_at: datetime

    class Config:
        from_attributes = True


class ListDatasetsResponse(BaseModel):
    datasets: List[DatasetListItem]


# Graphing schemas
class GraphConfigRequest(BaseModel):
    title: Optional[str] = None
    xlabel: Optional[str] = None
    ylabel: Optional[str] = None
    color_palette: str = "viridis"
    figsize: tuple = (10, 6)
    dpi: int = 100
    style: str = "whitegrid"
    font_size: int = 12
    title_size: int = 14
    label_size: int = 10
    rotation_x: int = 0
    rotation_y: int = 0
    grid: bool = True
    legend: bool = True
    tight_layout: bool = True
    custom_colors: Optional[List[str]] = None
    alpha: float = 0.8
    line_width: float = 2.0
    marker_size: int = 50
    bins: int = 30
    line_style: Optional[str] = None
    line_color: Optional[str] = None


class CustomPlotSpec(BaseModel):
    """Specification for executing an arbitrary Matplotlib/Seaborn/Pandas plot."""

    function: str
    module: Literal['axes', 'pyplot', 'figure', 'seaborn', 'pandas'] = 'axes'
    args: Optional[List[Any]] = None
    kwargs: Optional[Dict[str, Any]] = None
    apply_formatting: bool = True


class CreateGraphRequest(BaseModel):
    chart_type: str
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    y_columns: Optional[List[str]] = None
    column: Optional[str] = None
    columns: Optional[List[str]] = None
    color_by: Optional[str] = None
    size_by: Optional[str] = None
    group_by: Optional[str] = None
    aggregation: Optional[Literal['count','sum','mean','median','min','max']] = None
    return_data: Optional[bool] = False
    config: Optional[GraphConfigRequest] = None
    custom_plot: Optional[CustomPlotSpec] = None


class GraphResponse(BaseModel):
    chart_type: str
    image_base64: str
    parameters_used: Dict[str, Any]
    data: Optional[Dict[str, Any]] = None


class AvailableColumnsResponse(BaseModel):
    numerical: List[str]
    categorical: List[str]
    datetime: List[str]
    all: List[str]

# --- Modeling / Feature Lab Schemas ---
class ModelTaskRequest(BaseModel):
    target: str
    problem_type: Optional[Literal['auto','classification','regression']] = 'auto'
    include_columns: Optional[List[str]] = None  # whitelist
    exclude_columns: Optional[List[str]] = None  # blacklist (applied after include)
    test_size: float = 0.2
    random_state: int = 42
    max_rows: Optional[int] = 50000  # sampling cap for performance
    normalize_numeric: bool = True
    encode_categoricals: Literal['auto','onehot','ordinal'] = 'auto'
    feature_interactions: bool = True
    top_n_importances: int = 30

class FeatureImportanceItem(BaseModel):
    feature: str
    importance: float

class ModelMetrics(BaseModel):
    problem_type: str
    metric_primary: str
    metric_value: float
    additional: Dict[str, Any]

class CoefficientSummary(BaseModel):
    feature: str
    estimate: float
    std_error: Optional[float] = None
    t_value: Optional[float] = None
    p_value: Optional[float] = None
    confidence_interval: Optional[List[float]] = None

class ResidualSummary(BaseModel):
    min: float
    q1: float
    median: float
    q3: float
    max: float
    standard_error: Optional[float] = None

class ModelSummary(BaseModel):
    coefficients: Optional[List[CoefficientSummary]] = None
    residuals: Optional[ResidualSummary] = None
    r_squared: Optional[float] = None
    adj_r_squared: Optional[float] = None
    f_statistic: Optional[float] = None
    f_p_value: Optional[float] = None
    degrees_freedom: Optional[Dict[str, int]] = None
    classification_report: Optional[Dict[str, Any]] = None

class ModelPreviewRow(BaseModel):
    row_index: int
    prediction: Any
    actual: Optional[Any] = None
    probability: Optional[Any] = None

class ModelRunResponse(BaseModel):
    run_id: str
    dataset_id: int
    status: Literal['pending','running','completed','failed']
    target: str
    problem_type: str
    metrics: Optional[ModelMetrics] = None
    summary: Optional[ModelSummary] = None
    feature_importance: Optional[List[FeatureImportanceItem]] = None
    sample_predictions: Optional[List[ModelPreviewRow]] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    message: Optional[str] = None

class ListModelRunsResponse(BaseModel):
    runs: List[ModelRunResponse]

# --- Model Visualizations ---
class ModelVisualRequest(BaseModel):
    run_id: str
    kind: Literal['pred_vs_actual','residuals','confusion_matrix','roc','qq_plot','feature_importance','residuals_vs_fitted']
    max_points: int = 2000  # sampling cap for scatter-like visuals

class ModelVisualResponse(BaseModel):
    run_id: str
    kind: str
    problem_type: str
    sampled: int
    total: int
    data: Dict[str, Any]  # shape depends on kind
    message: Optional[str] = None
