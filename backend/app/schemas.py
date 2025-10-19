from datetime import datetime
from typing import List, Dict, Any, Literal, Optional, Union, Annotated
from pydantic import BaseModel, Field


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
    missing_mode: Literal['drop_rows', 'impute_mean', 'leave'] = 'leave'
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


class FilterCondition(BaseModel):
    column: str
    operator: Literal[
        'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
        'contains', 'not_contains', 'startswith', 'endswith',
        'in', 'not_in', 'between', 'is_null', 'not_null'
    ]
    value: Optional[Any] = None
    value_b: Optional[Any] = None
    case_sensitive: bool = False


class DropColumnsOperation(BaseModel):
    type: Literal['drop_columns']
    columns: List[str]


class FilterRowsOperation(BaseModel):
    type: Literal['filter_rows']
    conditions: List[FilterCondition]
    logic: Literal['and', 'or'] = 'and'


class SortKey(BaseModel):
    column: str
    ascending: bool = True


class SortValuesOperation(BaseModel):
    type: Literal['sort_values']
    keys: List[SortKey]
    na_position: Literal['first', 'last'] = 'last'


class DropDuplicatesOperation(BaseModel):
    type: Literal['drop_duplicates']
    subset: Optional[List[str]] = None
    keep: Literal['first', 'last', 'none'] = 'first'


class FillMissingOperation(BaseModel):
    type: Literal['fill_missing']
    column: str
    strategy: Literal['mean', 'median', 'mode', 'constant', 'forward_fill', 'backward_fill']
    value: Optional[Any] = None


class RenameColumnsOperation(BaseModel):
    type: Literal['rename_columns']
    mapping: Dict[str, str]


class ConvertTypeOperation(BaseModel):
    type: Literal['convert_type']
    column: str
    dtype: Literal['int', 'float', 'string', 'bool', 'datetime']
    errors: Literal['raise', 'ignore', 'coerce'] = 'coerce'


class KNNImputeOperation(BaseModel):
    type: Literal['knn_impute']
    columns: List[str]
    n_neighbors: int = 5
    weights: Literal['uniform', 'distance'] = 'uniform'


class NormalizeColumnsOperation(BaseModel):
    type: Literal['normalize_columns']
    columns: List[str]
    method: Literal['minmax', 'zscore'] = 'minmax'


class AggregationSpec(BaseModel):
    column: str
    func: Literal['count', 'sum', 'mean', 'median', 'min', 'max', 'std']
    alias: Optional[str] = None


class GroupByOperation(BaseModel):
    type: Literal['groupby']
    group_by: List[str]
    aggregations: List[AggregationSpec]


class PandasCodeOperation(BaseModel):
    type: Literal['pandas_code']
    code: str
    description: Optional[str] = None


ManipulationOperation = Annotated[
    Union[
        DropColumnsOperation,
        FilterRowsOperation,
        SortValuesOperation,
        DropDuplicatesOperation,
        FillMissingOperation,
        RenameColumnsOperation,
        ConvertTypeOperation,
        KNNImputeOperation,
        NormalizeColumnsOperation,
        GroupByOperation,
        PandasCodeOperation
    ],
    Field(discriminator='type')
]


class ManipulationRequest(BaseModel):
    operations: List[ManipulationOperation]


class ManipulationSummary(BaseModel):
    operation: str
    details: Dict[str, Any]


class ManipulationResponse(BaseModel):
    operations_applied: List[ManipulationSummary]
    row_count: int
    column_count: int


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
    problem_type: Optional[Literal['auto','classification','regression','time_series']] = 'auto'
    model_type: Literal[
        'linear_regression',
        'weighted_least_squares',
        'ridge_regression',
        'lasso_regression',
        'polynomial_regression',
        'logistic_regression',
        'random_forest_regression',
        'random_forest_classification',
        'arima',
        'sarima'
    ] = 'linear_regression'
    include_columns: Optional[List[str]] = None  # whitelist
    exclude_columns: Optional[List[str]] = None  # blacklist (applied after include)
    test_size: float = 0.2
    random_state: int = 42
    max_rows: Optional[int] = 50000  # sampling cap for performance
    normalize_numeric: bool = True
    encode_categoricals: Literal['auto','onehot','ordinal'] = 'auto'
    feature_interactions: bool = True
    top_n_importances: int = 30
    cv_folds: Optional[int] = None
    weight_column: Optional[str] = None
    alpha: Optional[float] = None
    polynomial_degree: Optional[int] = 2
    n_estimators: Optional[int] = None
    max_depth: Optional[int] = None
    time_column: Optional[str] = None
    forecast_horizon: Optional[int] = None
    arima_order: Optional[List[int]] = None
    seasonal_order: Optional[List[int]] = None
    seasonal_periods: Optional[int] = None
    return_diagnostics: bool = True

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
    time_series_details: Optional[Dict[str, Any]] = None

class ListModelRunsResponse(BaseModel):
    runs: List[ModelRunResponse]

# --- Model Visualizations ---
class ModelVisualRequest(BaseModel):
    run_id: str
    kind: Literal[
        'pred_vs_actual',
        'residuals',
        'confusion_matrix',
        'roc',
        'qq_plot',
        'feature_importance',
        'residuals_vs_fitted',
        'acf',
        'pacf',
        'ts_diagnostics',
        'forecast'
    ]
    max_points: int = 2000  # sampling cap for scatter-like visuals

class ModelVisualResponse(BaseModel):
    run_id: str
    kind: str
    problem_type: str
    sampled: int
    total: int
    data: Dict[str, Any]  # shape depends on kind
    message: Optional[str] = None
