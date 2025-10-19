from __future__ import annotations
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple, TYPE_CHECKING

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session
import numpy as np
"""Modeling endpoints. scikit-learn is optional for the rest of the app; we attempt
to import it here and set a flag. If it's not installed, modeling endpoints will
return a 503 with an actionable message instead of causing the whole app to fail
at import time.
"""

_SKLEARN_AVAILABLE = True
try:
    from sklearn.model_selection import train_test_split, cross_validate, StratifiedKFold, KFold
    from sklearn.preprocessing import OneHotEncoder, StandardScaler, PolynomialFeatures
    from sklearn.compose import ColumnTransformer
    from sklearn.pipeline import Pipeline
    from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, mean_squared_error, r2_score, mean_absolute_error
    from sklearn.linear_model import LogisticRegression, LinearRegression, Lasso, Ridge
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
except Exception:  # pragma: no cover - best-effort import
    _SKLEARN_AVAILABLE = False
    # define placeholders to avoid NameError when referenced elsewhere
    train_test_split = None
    cross_validate = None
    StratifiedKFold = None
    KFold = None
    OneHotEncoder = None
    StandardScaler = None
    PolynomialFeatures = None
    ColumnTransformer = None
    Pipeline = Any
    accuracy_score = None
    f1_score = None
    roc_auc_score = None
    mean_squared_error = None
    r2_score = None
    mean_absolute_error = None
    LogisticRegression = None
    LinearRegression = None
    Lasso = None
    Ridge = None
    RandomForestClassifier = None
    RandomForestRegressor = None

if TYPE_CHECKING:  # pragma: no cover - typing imports only
    from sklearn.pipeline import Pipeline as SklearnPipeline
else:
    SklearnPipeline = Any

_STATSMODELS_AVAILABLE = True
try:
    import statsmodels.api as sm  # type: ignore
    from statsmodels.tsa.statespace.sarimax import SARIMAX  # type: ignore
    from statsmodels.graphics.tsaplots import acf as sm_acf, pacf as sm_pacf  # type: ignore
    from statsmodels.stats.diagnostic import acorr_ljungbox  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    _STATSMODELS_AVAILABLE = False
    sm = None
    SARIMAX = None
    sm_acf = None
    sm_pacf = None
    acorr_ljungbox = None

from ..db import get_db, engine
from .. import models, schemas
from ..cleaning import cleaned_table_name

router = APIRouter()


def _require_sklearn():
    if not _SKLEARN_AVAILABLE:
        raise HTTPException(status_code=503, detail=(
            'scikit-learn is not installed in the server environment. '
            'Install it with `pip install scikit-learn` (or run the project start script) to enable modeling endpoints.'
        ))

def _require_statsmodels():
    if not _STATSMODELS_AVAILABLE:
        raise HTTPException(status_code=503, detail=(
            'statsmodels is not installed in the server environment. '
            'Install it with `pip install statsmodels` to enable time-series modeling endpoints.'
        ))

# In-memory registry for model runs (simple first pass). For production, persist to DB.
_MODEL_RUNS: Dict[str, Dict[str, Any]] = {}


def _get_dataset_or_404(dataset_id: int, db: Session) -> models.Dataset:
    ds = db.query(models.Dataset).filter(models.Dataset.id==dataset_id, models.Dataset.is_deleted==False).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return ds


def _load_cleaned_dataframe(dataset_id: int) -> pd.DataFrame:
    tbl = cleaned_table_name(dataset_id)
    # Simple read; rely on pandas + sqlite
    import sqlite3
    conn = sqlite3.connect(engine.url.database)  # type: ignore
    try:
        return pd.read_sql_query(f"SELECT * FROM {tbl}", conn)
    finally:
        conn.close()


def _infer_problem_type(df: pd.DataFrame, target: str) -> str:
    """Heuristic with safeguards:
    - If dtype object or categorical-like and unique count <= 50 -> classification
    - If numeric but unique ratio < 0.02 and unique count <= 25 -> classification
    - Otherwise regression.
    """
    y = df[target]
    series = y.dropna()
    unique_vals = series.unique()
    nunique = len(unique_vals)
    total = max(len(series), 1)
    unique_ratio = nunique / total
    # Object or low cardinality discrete
    if y.dtype == object or str(y.dtype).startswith('category'):
        if nunique <= 50:
            return 'classification'
    # Binary explicitly
    if nunique == 2:
        return 'classification'
    # Numeric but low cardinality relative to size
    if nunique <= 25 and unique_ratio < 0.02:
        return 'classification'
    return 'regression'


def _build_pipeline(
    df: pd.DataFrame,
    target: str,
    req: schemas.ModelTaskRequest,
    problem_type: str
):
    feature_cols = [c for c in df.columns if c != target and c != '_rowid']
    if req.include_columns:
        feature_cols = [c for c in feature_cols if c in req.include_columns]
    if req.exclude_columns:
        feature_cols = [c for c in feature_cols if c not in req.exclude_columns]

    weight_series: Optional[pd.Series] = None
    if req.weight_column:
        if req.weight_column == target:
            raise HTTPException(status_code=400, detail='Weight column cannot be the target column')
        if req.weight_column not in df.columns:
            raise HTTPException(status_code=400, detail=f"Weight column '{req.weight_column}' not found in dataset")
        weight_series = df[req.weight_column]
        if req.weight_column in feature_cols:
            feature_cols.remove(req.weight_column)

    if not feature_cols:
        raise HTTPException(status_code=400, detail="No feature columns available after filtering")

    X = df[feature_cols].copy()
    y = df[target]

    mask = y.notna()
    X = X.loc[mask].copy()
    y = y.loc[mask]
    if weight_series is not None:
        weight_series = weight_series.loc[mask]

    if req.max_rows and len(X) > req.max_rows:
        sampled = X.sample(req.max_rows, random_state=req.random_state)
        sample_index = sampled.index
        X = sampled
        y = y.loc[sample_index]
        if weight_series is not None:
            weight_series = weight_series.loc[sample_index]

    if weight_series is not None:
        weight_series = pd.to_numeric(weight_series, errors='coerce').fillna(0)
        if (weight_series < 0).any():
            raise HTTPException(status_code=400, detail='Weight column contains negative values which are not supported')

    categorical = [c for c in X.columns if X[c].dtype == object]
    numeric = [c for c in X.columns if c not in categorical]

    transformers: List[Any] = []
    if categorical:
        if req.encode_categoricals == 'ordinal':
            for c in categorical:
                codes, _ = pd.factorize(X[c])
                X.loc[:, c] = codes
            categorical = []
        else:
            transformers.append(('cat', OneHotEncoder(handle_unknown='ignore'), categorical))
    if numeric and req.normalize_numeric:
        transformers.append(('num', StandardScaler(), numeric))

    if transformers:
        preprocessor: Any = ColumnTransformer(transformers=transformers, remainder='passthrough')
    else:
        preprocessor = 'passthrough'

    steps: List[Tuple[str, Any]] = [('prep', preprocessor)]

    effective_model_type = req.model_type

    if problem_type == 'classification':
        if effective_model_type in {
            'linear_regression',
            'ridge_regression',
            'lasso_regression',
            'polynomial_regression',
            'weighted_least_squares'
        }:
            effective_model_type = 'logistic_regression'
        elif effective_model_type == 'random_forest_regression':
            effective_model_type = 'random_forest_classification'
    elif problem_type == 'regression':
        if effective_model_type in {'logistic_regression', 'random_forest_classification'}:
            effective_model_type = 'random_forest_regression' if effective_model_type == 'random_forest_classification' else 'linear_regression'

    if effective_model_type == 'polynomial_regression' and problem_type == 'regression':
        degree = req.polynomial_degree or 2
        if degree < 2:
            degree = 2
        steps.append(('poly', PolynomialFeatures(degree=degree, include_bias=False)))

    if effective_model_type == 'ridge_regression':
        alpha = req.alpha if req.alpha is not None else 1.0
        model = Ridge(alpha=alpha)
    elif effective_model_type == 'lasso_regression':
        alpha = req.alpha if req.alpha is not None else 0.1
        model = Lasso(alpha=alpha, max_iter=10000, random_state=req.random_state)
    elif effective_model_type == 'logistic_regression':
        model = LogisticRegression(random_state=req.random_state, max_iter=2000)
    elif effective_model_type == 'random_forest_regression':
        n_estimators = req.n_estimators or 300
        model = RandomForestRegressor(
            n_estimators=n_estimators,
            max_depth=req.max_depth,
            random_state=req.random_state,
            n_jobs=-1
        )
    elif effective_model_type == 'random_forest_classification':
        n_estimators = req.n_estimators or 300
        model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=req.max_depth,
            random_state=req.random_state,
            n_jobs=-1
        )
    elif effective_model_type == 'weighted_least_squares':
        if weight_series is None:
            raise HTTPException(status_code=400, detail='Weighted least squares requires a weight column')
        model = LinearRegression()
    else:
        # Default to linear regression variants
        model = LinearRegression()

    steps.append(('model', model))
    pipe = Pipeline(steps=steps)
    return X, y, pipe, feature_cols, categorical, numeric, weight_series


def _compute_feature_importance(pipeline: SklearnPipeline, feature_cols: List[str], categorical: List[str]) -> List[schemas.FeatureImportanceItem]:
    model = pipeline.named_steps['model']
    importances = None
    if hasattr(model, 'feature_importances_'):
        importances = model.feature_importances_
    if importances is None:
        return []
    # Need to expand one-hot columns if present
    prep = pipeline.named_steps['prep']
    expanded_names: List[str] = []
    if isinstance(prep, ColumnTransformer):
        for name, trans, cols in prep.transformers_:
            if name == 'cat' and hasattr(trans, 'get_feature_names_out'):
                expanded_names.extend(trans.get_feature_names_out(cols).tolist())
            elif name == 'num':
                expanded_names.extend(cols)
    else:
        expanded_names = feature_cols
    items = []
    for f, imp in zip(expanded_names, importances):
        items.append(schemas.FeatureImportanceItem(feature=f, importance=float(imp)))
    items.sort(key=lambda x: x.importance, reverse=True)
    return items


def _compute_comprehensive_summary(pipeline: SklearnPipeline, X_train, X_test, y_train, y_test, 
                                 y_pred, problem_type: str, feature_cols: List[str]) -> schemas.ModelSummary:
    """Compute comprehensive model statistics similar to R's lm.summary()"""
    import numpy as np
    from sklearn.metrics import classification_report
    import scipy.stats as stats
    
    summary = schemas.ModelSummary()
    
    if problem_type == 'regression':
        # Calculate residuals
        residuals = y_test - y_pred
        
        # Residual summary statistics
        summary.residuals = schemas.ResidualSummary(
            min=float(np.min(residuals)),
            q1=float(np.percentile(residuals, 25)),
            median=float(np.median(residuals)),
            q3=float(np.percentile(residuals, 75)),
            max=float(np.max(residuals)),
            standard_error=float(np.std(residuals))
        )
        
        # R-squared and adjusted R-squared
        n_samples, n_features = X_train.shape
        r2 = r2_score(y_test, y_pred)
        adj_r2 = 1 - (1 - r2) * (n_samples - 1) / (n_samples - n_features - 1)
        
        summary.r_squared = float(r2)
        summary.adj_r_squared = float(adj_r2)
        
        # Calculate F-statistic
        df_model = n_features
        df_resid = n_samples - n_features - 1
        if df_resid > 0 and r2 < 1.0:
            f_statistic = (r2 / df_model) / ((1 - r2) / df_resid)
            f_p_value = 1 - stats.f.cdf(f_statistic, df_model, df_resid)
            summary.f_statistic = float(f_statistic)
            summary.f_p_value = float(f_p_value)
        
        # Degrees of freedom
        summary.degrees_freedom = {
            'residual': int(df_resid),
            'model': int(df_model)
        }
        
        # For linear regression, try to compute coefficient statistics
        model = pipeline.named_steps['model']
        if hasattr(model, 'coef_') and hasattr(model, 'intercept_'):
            try:
                # Calculate standard errors, t-values, and p-values
                from sklearn.linear_model import LinearRegression
                
                # Get the transformed training data
                X_transformed = pipeline.named_steps['prep'].transform(X_train) if pipeline.named_steps['prep'] != 'passthrough' else X_train
                
                # Convert to numpy array if it's sparse
                if hasattr(X_transformed, 'toarray'):
                    X_transformed = X_transformed.toarray()
                
                # Ensure we have numpy arrays
                X_transformed = np.array(X_transformed)
                y_train_arr = np.array(y_train)
                y_pred_train = pipeline.predict(X_train)
                
                # Calculate residuals and MSE
                residuals_train = y_train_arr - y_pred_train
                mse = np.mean(residuals_train ** 2)
                
                # Calculate design matrix (X with intercept column)
                n_samples, n_features = X_transformed.shape
                X_with_intercept = np.column_stack([np.ones(n_samples), X_transformed])
                
                # Calculate standard errors using the formula: SE = sqrt(MSE * diag(inv(X'X)))
                try:
                    XtX_inv = np.linalg.inv(X_with_intercept.T @ X_with_intercept)
                    var_coef = mse * np.diag(XtX_inv)
                    std_errors = np.sqrt(np.abs(var_coef))  # abs to handle numerical issues
                    
                    # Get feature names after preprocessing
                    if hasattr(pipeline.named_steps['prep'], 'get_feature_names_out'):
                        feature_names = list(pipeline.named_steps['prep'].get_feature_names_out())
                    else:
                        feature_names = feature_cols
                    
                    coefficients = []
                    
                    # Intercept
                    intercept_se = std_errors[0] if len(std_errors) > 0 else None
                    intercept_t = model.intercept_ / intercept_se if intercept_se and intercept_se > 0 else None
                    intercept_p = 2 * (1 - stats.t.cdf(abs(intercept_t), n_samples - n_features - 1)) if intercept_t is not None else None
                    
                    coefficients.append(schemas.CoefficientSummary(
                        feature='(Intercept)',
                        estimate=float(model.intercept_),
                        std_error=float(intercept_se) if intercept_se is not None else None,
                        t_value=float(intercept_t) if intercept_t is not None else None,
                        p_value=float(intercept_p) if intercept_p is not None else None
                    ))
                    
                    # Feature coefficients
                    for i, (name, coef) in enumerate(zip(feature_names, model.coef_)):
                        se_idx = i + 1  # +1 because intercept is at index 0
                        coef_se = std_errors[se_idx] if se_idx < len(std_errors) else None
                        coef_t = coef / coef_se if coef_se and coef_se > 0 else None
                        coef_p = 2 * (1 - stats.t.cdf(abs(coef_t), n_samples - n_features - 1)) if coef_t is not None else None
                        
                        coefficients.append(schemas.CoefficientSummary(
                            feature=str(name),
                            estimate=float(coef),
                            std_error=float(coef_se) if coef_se is not None else None,
                            t_value=float(coef_t) if coef_t is not None else None,
                            p_value=float(coef_p) if coef_p is not None else None
                        ))
                    
                    summary.coefficients = coefficients
                    
                except np.linalg.LinAlgError:
                    # If matrix is singular, fall back to coefficients without statistics
                    if hasattr(pipeline.named_steps['prep'], 'get_feature_names_out'):
                        feature_names = list(pipeline.named_steps['prep'].get_feature_names_out())
                    else:
                        feature_names = feature_cols
                    
                    coefficients = []
                    coefficients.append(schemas.CoefficientSummary(
                        feature='(Intercept)',
                        estimate=float(model.intercept_)
                    ))
                    
                    for name, coef in zip(feature_names, model.coef_):
                        coefficients.append(schemas.CoefficientSummary(
                            feature=str(name),
                            estimate=float(coef)
                        ))
                    
                    summary.coefficients = coefficients
                
            except Exception as e:
                # If coefficient analysis fails, continue without it
                pass
    
    elif problem_type == 'classification':
        # Classification report
        try:
            report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
            summary.classification_report = report
        except Exception:
            pass
        
        # For logistic regression, try to get coefficient information with statistics
        model = pipeline.named_steps['model']
        if hasattr(model, 'coef_') and hasattr(model, 'intercept_'):
            try:
                from sklearn.linear_model import LogisticRegression
                
                # Get feature names after preprocessing
                if hasattr(pipeline.named_steps['prep'], 'get_feature_names_out'):
                    feature_names = list(pipeline.named_steps['prep'].get_feature_names_out())
                else:
                    feature_names = feature_cols
                
                coefficients = []
                
                # For logistic regression, we can compute approximate standard errors
                if isinstance(model, LogisticRegression):
                    try:
                        # Get the transformed training data
                        X_transformed = pipeline.named_steps['prep'].transform(X_train) if pipeline.named_steps['prep'] != 'passthrough' else X_train
                        
                        # Convert to numpy array if it's sparse
                        if hasattr(X_transformed, 'toarray'):
                            X_transformed = X_transformed.toarray()
                        
                        X_transformed = np.array(X_transformed)
                        n_samples, n_features = X_transformed.shape
                        
                        # Get predictions on training data
                        proba = model.predict_proba(X_transformed)
                        
                        # Handle binary vs multiclass
                        if model.coef_.ndim == 1:
                            # Binary classification
                            p = proba[:, 1]  # Probability of positive class
                            
                            # Create design matrix with intercept
                            X_with_intercept = np.column_stack([np.ones(n_samples), X_transformed])
                            
                            # Calculate Fisher Information Matrix approximation
                            W = np.diag(p * (1 - p))  # Weight matrix
                            
                            try:
                                # Fisher Information Matrix: X'WX
                                fisher_info = X_with_intercept.T @ W @ X_with_intercept
                                covariance_matrix = np.linalg.inv(fisher_info)
                                std_errors = np.sqrt(np.diag(covariance_matrix))
                                
                                # Intercept
                                intercept_se = std_errors[0] if len(std_errors) > 0 else None
                                intercept_z = model.intercept_[0] / intercept_se if intercept_se and intercept_se > 0 else None
                                intercept_p = 2 * (1 - stats.norm.cdf(abs(intercept_z))) if intercept_z is not None else None
                                
                                coefficients.append(schemas.CoefficientSummary(
                                    feature='(Intercept)',
                                    estimate=float(model.intercept_[0]),
                                    std_error=float(intercept_se) if intercept_se is not None else None,
                                    t_value=float(intercept_z) if intercept_z is not None else None,  # Using z-score for logistic
                                    p_value=float(intercept_p) if intercept_p is not None else None
                                ))
                                
                                # Feature coefficients
                                for i, (name, coef) in enumerate(zip(feature_names, model.coef_)):
                                    se_idx = i + 1
                                    coef_se = std_errors[se_idx] if se_idx < len(std_errors) else None
                                    coef_z = coef / coef_se if coef_se and coef_se > 0 else None
                                    coef_p = 2 * (1 - stats.norm.cdf(abs(coef_z))) if coef_z is not None else None
                                    
                                    coefficients.append(schemas.CoefficientSummary(
                                        feature=str(name),
                                        estimate=float(coef),
                                        std_error=float(coef_se) if coef_se is not None else None,
                                        t_value=float(coef_z) if coef_z is not None else None,
                                        p_value=float(coef_p) if coef_p is not None else None
                                    ))
                                
                            except np.linalg.LinAlgError:
                                # Fall back to estimates only
                                coefficients.append(schemas.CoefficientSummary(
                                    feature='(Intercept)',
                                    estimate=float(model.intercept_[0])
                                ))
                                
                                for name, coef in zip(feature_names, model.coef_):
                                    coefficients.append(schemas.CoefficientSummary(
                                        feature=str(name),
                                        estimate=float(coef)
                                    ))
                        else:
                            # Multiclass - just show first class for simplicity (no statistics)
                            coefficients.append(schemas.CoefficientSummary(
                                feature='(Intercept)',
                                estimate=float(model.intercept_[0])
                            ))
                            
                            for name, coef in zip(feature_names, model.coef_[0]):
                                coefficients.append(schemas.CoefficientSummary(
                                    feature=str(name),
                                    estimate=float(coef)
                                ))
                        
                    except Exception:
                        # Fall back to simple coefficients
                        if model.coef_.ndim == 1:
                            coefficients.append(schemas.CoefficientSummary(
                                feature='(Intercept)',
                                estimate=float(model.intercept_[0])
                            ))
                            
                            for name, coef in zip(feature_names, model.coef_):
                                coefficients.append(schemas.CoefficientSummary(
                                    feature=str(name),
                                    estimate=float(coef)
                                ))
                        else:
                            coefficients.append(schemas.CoefficientSummary(
                                feature='(Intercept)',
                                estimate=float(model.intercept_[0])
                            ))
                            
                            for name, coef in zip(feature_names, model.coef_[0]):
                                coefficients.append(schemas.CoefficientSummary(
                                    feature=str(name),
                                    estimate=float(coef)
                                ))
                else:
                    # Non-logistic classifier, just show coefficients if available
                    if model.coef_.ndim == 1:
                        coefficients.append(schemas.CoefficientSummary(
                            feature='(Intercept)',
                            estimate=float(model.intercept_[0])
                        ))
                        
                        for name, coef in zip(feature_names, model.coef_):
                            coefficients.append(schemas.CoefficientSummary(
                                feature=str(name),
                                estimate=float(coef)
                            ))
                    else:
                        coefficients.append(schemas.CoefficientSummary(
                            feature='(Intercept)',
                            estimate=float(model.intercept_[0])
                        ))
                        
                        for name, coef in zip(feature_names, model.coef_[0]):
                            coefficients.append(schemas.CoefficientSummary(
                                feature=str(name),
                                estimate=float(coef)
                            ))
                
                summary.coefficients = coefficients
                
            except Exception as e:
                pass
    
    return summary


def _to_serializable(value: Any) -> Any:
    """Convert numpy scalars to native Python types for JSON serialization."""
    if isinstance(value, np.generic):  # type: ignore[arg-type]
        return value.item()
    return value


def _format_index_value(value: Any) -> str:
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _train_tabular_model(
    df: pd.DataFrame,
    request: schemas.ModelTaskRequest,
    problem_type: str
) -> Dict[str, Any]:
    X, y, pipeline, feature_cols, cat_cols, num_cols, weight_series = _build_pipeline(df, request.target, request, problem_type)
    current_problem_type = problem_type

    if current_problem_type == 'classification':
        value_counts = y.value_counts()
        too_small = value_counts[value_counts < 2]
        if len(value_counts) == 1:
            if pd.api.types.is_numeric_dtype(y):
                current_problem_type = 'regression'
            else:
                raise ValueError("Target has only one class; need at least two distinct classes for classification.")
        elif not too_small.empty:
            rare_idx = y.isin(too_small.index)
            rare_frac = rare_idx.mean()
            if rare_frac < 0.02:
                X = X.loc[~rare_idx]
                y = y.loc[~rare_idx]
                if weight_series is not None:
                    weight_series = weight_series.loc[X.index]
            elif pd.api.types.is_numeric_dtype(y):
                current_problem_type = 'regression'
            else:
                raise ValueError(f"Classes with <2 samples present: {', '.join(too_small.index.astype(str))}.")

    if pipeline.named_steps['model'].__class__.__name__.endswith('Classifier') and current_problem_type == 'regression':
        X, y, pipeline, feature_cols, cat_cols, num_cols, weight_series = _build_pipeline(df, request.target, request, 'regression')
        current_problem_type = 'regression'

    additional: Dict[str, Any] = {}
    if request.cv_folds and request.cv_folds >= 2 and len(X) >= request.cv_folds:
        if weight_series is None:
            try:
                if current_problem_type == 'classification':
                    cv = StratifiedKFold(n_splits=request.cv_folds, shuffle=True, random_state=request.random_state)
                    scoring = {
                        'f1_weighted': 'f1_weighted',
                        'accuracy': 'accuracy'
                    }
                else:
                    cv = KFold(n_splits=request.cv_folds, shuffle=True, random_state=request.random_state)
                    scoring = {
                        'rmse': 'neg_root_mean_squared_error',
                        'r2': 'r2'
                    }
                cv_results = cross_validate(pipeline, X, y, cv=cv, scoring=scoring, n_jobs=-1)
                cv_summary: Dict[str, Dict[str, float]] = {}
                for label in scoring.keys():
                    values = np.array(cv_results[f'test_{label}'], dtype=float)
                    if label == 'rmse':
                        values = np.abs(values)
                    cv_summary[label] = {
                        'mean': float(np.mean(values)),
                        'std': float(np.std(values))
                    }
                additional['cross_validation'] = {
                    'folds': request.cv_folds,
                    'scores': cv_summary
                }
            except Exception as cv_err:
                additional['cross_validation_error'] = str(cv_err)
        else:
            additional['cross_validation_note'] = 'Cross-validation skipped because sample weights were provided.'

    stratify_arg = y if current_problem_type == 'classification' else None
    try:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y,
            test_size=request.test_size,
            random_state=request.random_state,
            stratify=stratify_arg
        )
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(
            X, y,
            test_size=request.test_size,
            random_state=request.random_state,
            stratify=None
        )

    fit_kwargs: Dict[str, Any] = {}
    weight_test = None
    if weight_series is not None:
        weight_series = weight_series.reindex(y.index).fillna(0)
        weight_train = weight_series.reindex(y_train.index).fillna(0)
        weight_test = weight_series.reindex(y_test.index).fillna(0)
        fit_kwargs['model__sample_weight'] = weight_train.to_numpy()

    pipeline.fit(X_train, y_train, **fit_kwargs)
    preds = pipeline.predict(X_test)

    metrics_primary = ''
    metric_value = 0.0
    proba = None
    if current_problem_type == 'classification':
        metrics_primary = 'f1'
        try:
            metric_value = float(f1_score(y_test, preds, average='weighted'))
        except Exception:
            metric_value = float(accuracy_score(y_test, preds))
        additional['accuracy'] = float(accuracy_score(y_test, preds))
        if hasattr(pipeline.named_steps['model'], 'predict_proba'):
            try:
                proba = pipeline.predict_proba(X_test)
                if proba.shape[1] == 2:
                    roc = roc_auc_score(y_test, proba[:, 1])
                    additional['roc_auc'] = float(roc)
            except Exception as prob_err:
                additional['probability_warning'] = str(prob_err)
                proba = None
    else:
        metrics_primary = 'rmse'
        try:
            rmse = mean_squared_error(y_test, preds, squared=False)
        except TypeError:
            import math
            rmse = math.sqrt(mean_squared_error(y_test, preds))
        metric_value = float(rmse)
        try:
            additional['r2'] = float(r2_score(y_test, preds))
        except Exception:
            pass
        try:
            additional['mae'] = float(mean_absolute_error(y_test, preds))
        except Exception:
            pass

    if weight_series is not None:
        additional['sample_weight_column'] = request.weight_column

    importances = _compute_feature_importance(pipeline, feature_cols, cat_cols)
    if request.top_n_importances and importances:
        importances = importances[:request.top_n_importances]

    comprehensive_summary = _compute_comprehensive_summary(
        pipeline, X_train, X_test, y_train, y_test, preds, current_problem_type, feature_cols
    )

    sample_rows: List[schemas.ModelPreviewRow] = []
    sample_size = min(25, len(preds))
    classes = list(getattr(pipeline.named_steps['model'], 'classes_', [])) if current_problem_type == 'classification' else []
    for idx in range(sample_size):
        if hasattr(X_test, 'index'):
            raw_index = X_test.index[idx]
        else:
            raw_index = idx
        try:
            row_index_val = int(raw_index)
        except Exception:
            row_index_val = idx
        prediction_val = _to_serializable(preds[idx])
        actual_val = _to_serializable(y_test.iloc[idx])
        probability_val: Optional[Any] = None
        if current_problem_type == 'classification' and proba is not None:
            row_proba = proba[idx]
            if classes and len(row_proba) == len(classes):
                probability_val = {str(cls): float(row_proba[class_idx]) for class_idx, cls in enumerate(classes)}
            else:
                probability_val = [float(x) for x in row_proba]
        sample_rows.append(
            schemas.ModelPreviewRow(
                row_index=row_index_val,
                prediction=prediction_val,
                actual=actual_val,
                probability=probability_val
            )
        )

    y_test_list = y_test.tolist() if len(y_test) <= 50000 else y_test.head(50000).tolist()
    preds_list = preds.tolist() if hasattr(preds, 'tolist') else list(preds)
    if len(preds_list) > 50000:
        preds_list = preds_list[:50000]
    proba_list = proba.tolist() if proba is not None else None
    if proba_list is not None and len(proba_list) > 50000:
        proba_list = proba_list[:50000]

    metrics = schemas.ModelMetrics(
        problem_type=current_problem_type,
        metric_primary=metrics_primary,
        metric_value=float(metric_value),
        additional=additional
    )

    return {
        'status': 'completed',
        'problem_type': current_problem_type,
        'metrics': metrics,
        'summary': comprehensive_summary,
        'feature_importance': importances,
        'sample_predictions': sample_rows,
        'completed_at': datetime.utcnow(),
        '_y_test': y_test_list,
        '_preds': preds_list,
        '_proba': proba_list
    }


def _train_time_series_model(
    df: pd.DataFrame,
    request: schemas.ModelTaskRequest,
    problem_type: str
) -> Dict[str, Any]:
    time_column = request.time_column
    if not time_column:
        raise HTTPException(status_code=400, detail='Time column is required for time-series models')
    if time_column not in df.columns:
        raise HTTPException(status_code=400, detail=f"Time column '{time_column}' not found")

    ts_df = df[[time_column, request.target]].dropna()
    if ts_df.empty:
        raise HTTPException(status_code=400, detail='No rows available after dropping missing values for time-series modeling')

    ts_df = ts_df.sort_values(time_column)
    ts_df[time_column] = pd.to_datetime(ts_df[time_column], errors='coerce')
    ts_df = ts_df.dropna(subset=[time_column])
    ts_df['_value'] = pd.to_numeric(ts_df[request.target], errors='coerce')
    ts_df = ts_df.dropna(subset=['_value'])

    series = ts_df['_value']
    series.index = ts_df[time_column]
    series.name = request.target

    if len(series) < 10:
        raise HTTPException(status_code=400, detail='Time-series modeling requires at least 10 observations after cleaning')

    test_count = 0
    if request.test_size and request.test_size > 0:
        test_count = int(round(len(series) * request.test_size))
        test_count = max(test_count, 0)
    if test_count >= len(series):
        test_count = max(1, len(series) // 5)
    if test_count >= len(series):
        test_count = 0

    if test_count > 0:
        train_series = series.iloc[:-test_count]
        test_series = series.iloc[-test_count:]
    else:
        train_series = series
        test_series = pd.Series(dtype=float, index=pd.Index([], name=series.index.name))

    if len(train_series) < 5:
        raise HTTPException(status_code=400, detail='Not enough data remaining for training after holdout split')

    order_values = request.arima_order or [1, 1, 1]
    if len(order_values) != 3:
        raise HTTPException(status_code=400, detail='ARIMA order must contain three integers (p, d, q)')
    order = tuple(int(v) for v in order_values)

    if request.model_type == 'sarima':
        if request.seasonal_order:
            if len(request.seasonal_order) != 4:
                raise HTTPException(status_code=400, detail='Seasonal order must contain four integers (P, D, Q, s)')
            seasonal_order = tuple(int(v) for v in request.seasonal_order)
        else:
            period = int(request.seasonal_periods or 0)
            if period <= 1:
                seasonal_order = (0, 0, 0, 0)
            else:
                seasonal_order = (1, 1, 1, period)
    else:
        seasonal_order = (0, 0, 0, 0)

    model = SARIMAX(
        train_series,
        order=order,
        seasonal_order=seasonal_order,
        enforce_stationarity=False,
        enforce_invertibility=False
    )
    results = model.fit(disp=False)

    residuals = results.resid
    fitted = results.fittedvalues

    metrics_additional: Dict[str, Any] = {
        'aic': float(results.aic),
        'bic': float(results.bic),
        'hqic': float(results.hqic)
    }

    metric_value = 0.0
    test_pred = pd.Series(dtype=float)
    if test_count > 0:
        forecast_test = results.get_forecast(steps=test_count)
        test_pred = forecast_test.predicted_mean
        rmse = float(mean_squared_error(test_series, test_pred, squared=False))
        metric_value = rmse
        metrics_additional['mae'] = float(mean_absolute_error(test_series, test_pred))
        denom = test_series.replace(0, np.nan)
        if not denom.isna().all():
            mape = float(np.nanmean(np.abs((test_series - test_pred) / denom)) * 100)
            if np.isfinite(mape):
                metrics_additional['mape'] = mape
        metrics_additional['holdout_start'] = _format_index_value(test_series.index[0])
        metrics_additional['holdout_end'] = _format_index_value(test_series.index[-1])
    else:
        metric_value = float(np.sqrt(results.sse / len(train_series)))
        metrics_additional['note'] = 'No holdout set available; reporting in-sample RMSE.'

    horizon = request.forecast_horizon or max(test_count, 12)
    if horizon < 1:
        horizon = max(1, test_count if test_count > 0 else 12)

    forecast_future = results.get_forecast(steps=horizon)
    future_mean = forecast_future.predicted_mean
    future_conf = forecast_future.conf_int()

    diagnostics: Dict[str, Any] = {}
    acf_values_list: Optional[List[float]] = None
    pacf_values_list: Optional[List[float]] = None
    acf_lags: Optional[List[int]] = None
    if request.return_diagnostics:
        resid_clean = residuals.dropna()
        nlags = min(40, len(resid_clean) - 1) if len(resid_clean) > 1 else 0
        if nlags >= 1:
            acf_array = sm_acf(resid_clean, nlags=nlags, fft=True)
            pacf_array = sm_pacf(resid_clean, nlags=nlags)
            acf_values_list = list(map(float, acf_array))
            pacf_values_list = list(map(float, pacf_array))
            acf_lags = list(range(len(acf_values_list)))
            try:
                lb_df = acorr_ljungbox(resid_clean, lags=[min(10, nlags)], return_df=True)
                lb_row = lb_df.iloc[-1]
                diagnostics['ljung_box'] = {
                    'statistic': float(lb_row['lb_stat']),
                    'p_value': float(lb_row['lb_pvalue']),
                    'lags_tested': int(lb_df.index[-1])
                }
            except Exception:
                diagnostics['ljung_box'] = None
        diagnostics['residual_variance'] = float(resid_clean.var()) if len(resid_clean) else None

    if test_count > 0:
        storage_actual = test_series
        storage_pred = test_pred
    else:
        fitted_aligned = fitted.reindex(train_series.index)
        mask = ~fitted_aligned.isna()
        storage_actual = train_series.loc[mask]
        storage_pred = fitted_aligned.loc[mask]

    sample_rows: List[schemas.ModelPreviewRow] = []
    storage_length = len(storage_pred)
    if storage_length > 0:
        sample_size = min(25, storage_length)
        for idx in range(sample_size):
            sample_rows.append(
                schemas.ModelPreviewRow(
                    row_index=idx,
                    prediction=float(storage_pred.iloc[idx]),
                    actual=float(storage_actual.iloc[idx])
                )
            )

    metrics = schemas.ModelMetrics(
        problem_type='time_series',
        metric_primary='rmse',
        metric_value=float(metric_value),
        additional=metrics_additional
    )

    time_series_details: Dict[str, Any] = {
        'model_type': request.model_type,
        'order': list(order),
        'seasonal_order': list(seasonal_order),
        'training_observations': len(train_series),
        'holdout_observations': int(test_count),
        'train_start': _format_index_value(train_series.index[0]),
        'train_end': _format_index_value(train_series.index[-1]),
        'forecast_horizon': int(horizon),
        'diagnostics': diagnostics if diagnostics else None
    }
    if test_count > 0:
        time_series_details['holdout_start'] = _format_index_value(test_series.index[0])
        time_series_details['holdout_end'] = _format_index_value(test_series.index[-1])

    if storage_length > 50000:
        storage_actual_slice = storage_actual.iloc[:50000]
        storage_pred_slice = storage_pred.iloc[:50000]
    else:
        storage_actual_slice = storage_actual
        storage_pred_slice = storage_pred

    y_storage_list = storage_actual_slice.tolist()
    preds_storage_list = storage_pred_slice.tolist()
    storage_index_list = [_format_index_value(idx) for idx in storage_actual_slice.index]

    return {
        'status': 'completed',
        'problem_type': 'time_series',
        'metrics': metrics,
        'summary': None,
        'feature_importance': None,
        'sample_predictions': sample_rows or None,
        'completed_at': datetime.utcnow(),
        '_y_test': y_storage_list,
        '_preds': preds_storage_list,
        '_proba': None,
        'time_series_details': time_series_details,
    '_ts_storage_index': storage_index_list,
        '_ts_series_index': [_format_index_value(idx) for idx in series.index],
        '_ts_series_values': [float(val) for val in series.tolist()],
        '_ts_residual_index': [_format_index_value(idx) for idx in residuals.index],
        '_ts_residuals': [float(val) for val in residuals.tolist()],
        '_ts_fitted_index': [_format_index_value(idx) for idx in fitted.index],
        '_ts_fitted_values': [float(val) for val in fitted.tolist()],
        '_ts_forecast_index': [_format_index_value(idx) for idx in future_mean.index],
        '_ts_forecast_mean': [float(val) for val in future_mean.tolist()],
        '_ts_forecast_lower': [float(val) for val in future_conf.iloc[:, 0].tolist()] if future_conf is not None else None,
        '_ts_forecast_upper': [float(val) for val in future_conf.iloc[:, 1].tolist()] if future_conf is not None else None,
        '_ts_acf': acf_values_list,
        '_ts_acf_lags': acf_lags,
        '_ts_pacf': pacf_values_list
    }

@router.post('/datasets/{dataset_id}/model/runs', response_model=schemas.ModelRunResponse)
async def create_model_run(dataset_id: int, request: schemas.ModelTaskRequest, db: Session = Depends(get_db)):
    _require_sklearn()
    ds = _get_dataset_or_404(dataset_id, db)
    df = _load_cleaned_dataframe(dataset_id)
    if request.target not in df.columns:
        raise HTTPException(status_code=400, detail=f"Target column '{request.target}' not found")
    problem_type = request.problem_type
    if problem_type == 'auto':
        problem_type = _infer_problem_type(df, request.target)

    run_id = str(uuid.uuid4())
    run_record: Dict[str, Any] = {
        'run_id': run_id,
        'dataset_id': dataset_id,
        'status': 'running',
        'target': request.target,
        'problem_type': problem_type,
        'created_at': datetime.utcnow(),
    }
    _MODEL_RUNS[run_id] = run_record

    try:
        if problem_type == 'time_series' or request.model_type in ('arima', 'sarima'):
            _require_statsmodels()
            update = _train_time_series_model(df, request, problem_type)
        else:
            update = _train_tabular_model(df, request, problem_type)
        run_record.update(update)
    except Exception as e:
        friendly = _friendly_error(str(e), problem_type)
        run_record.update({'status': 'failed', 'message': friendly, 'completed_at': datetime.utcnow()})

    return schemas.ModelRunResponse(**run_record)

def _friendly_error(msg: str, problem_type: str) -> str:
    lower = msg.lower()
    if 'least populated class' in lower:
        return 'Not enough samples per class. Consider choosing regression or a target with more occurrences.'
    if 'only one class' in lower or 'only 1 member' in lower:
        return 'Target has a single class. Classification needs at least 2 classes. Try regression if numeric.'
    if 'unknown label type' in lower:
        return 'Target appears continuous; choose regression instead of classification.'
    if 'squared' in lower and 'unexpected keyword' in lower:
        return 'Incompatible sklearn version for RMSE shortcut; upgrade scikit-learn or ignore (internal fallback used).'
    if 'feature names' in lower and 'seen at fit time' in lower:
        return 'Mismatch between training and prediction features. Retry the run.'
    return msg


@router.post('/datasets/{dataset_id}/model/visual', response_model=schemas.ModelVisualResponse)
async def model_visual(dataset_id: int, request: schemas.ModelVisualRequest, db: Session = Depends(get_db)):
    _require_sklearn()
    _ = _get_dataset_or_404(dataset_id, db)
    rec = _MODEL_RUNS.get(request.run_id)
    if not rec or rec['dataset_id'] != dataset_id:
        raise HTTPException(status_code=404, detail='Model run not found')
    if rec.get('status') != 'completed':
        raise HTTPException(status_code=400, detail='Model run not completed')
    problem_type = rec.get('problem_type','unknown')
    is_time_series = problem_type == 'time_series'
    y_true = rec.get('_y_test')
    y_pred = rec.get('_preds')
    proba = rec.get('_proba')
    ts_storage_index = rec.get('_ts_storage_index') if is_time_series else None
    if not is_time_series and (y_true is None or y_pred is None):
        raise HTTPException(status_code=400, detail='Run lacks stored predictions')
    if is_time_series and (y_true is None or y_pred is None) and request.kind not in ('acf', 'pacf', 'ts_diagnostics', 'forecast'):
        raise HTTPException(status_code=400, detail='Time-series run lacks stored predictions for this visualization')
    total = len(y_true) if y_true is not None else 0
    import random
    idx = list(range(total))
    if request.kind in ('pred_vs_actual','residuals') and total > request.max_points:
        random.seed(42)
        idx = random.sample(idx, request.max_points)
    # Build payload
    requested_kind = request.kind
    kind = 'roc' if requested_kind == 'roc_curve' else requested_kind
    data: Dict[str, Any] = {}
    if kind == 'pred_vs_actual':
        if y_true is None or y_pred is None:
            raise HTTPException(status_code=400, detail='No prediction data available for this visualization')
        data = {
            'actual': [y_true[i] for i in idx],
            'pred': [y_pred[i] for i in idx]
        }
        if is_time_series and ts_storage_index:
            data['index'] = [ts_storage_index[i] for i in idx]
    elif kind == 'residuals':
        try:
            residuals = [y_true[i] - y_pred[i] for i in range(len(y_true))]
        except Exception:
            residuals = []
        if residuals:
            if len(residuals) > request.max_points:
                random.seed(43)
                sample_idx = random.sample(range(len(residuals)), request.max_points)
            else:
                sample_idx = list(range(len(residuals)))
            data = {
                'residuals': [residuals[i] for i in sample_idx]
            }
            if is_time_series and ts_storage_index:
                data['index'] = [ts_storage_index[i] for i in sample_idx]
    elif kind == 'confusion_matrix':
        if problem_type != 'classification':
            raise HTTPException(status_code=400, detail='Confusion matrix only for classification')
        from collections import defaultdict
        labels = sorted(set(y_true))
        label_to_idx = {v:i for i,v in enumerate(labels)}
        matrix = [[0 for _ in labels] for _ in labels]
        for a, p in zip(y_true, y_pred):
            if a in label_to_idx and p in label_to_idx:
                matrix[label_to_idx[a]][label_to_idx[p]] += 1
        data = {'labels': labels, 'matrix': matrix}
    elif kind == 'roc':
        if problem_type != 'classification':
            raise HTTPException(status_code=400, detail='ROC only for classification')
        # Only for binary classification
        unique = sorted(set(y_true))
        if len(unique) != 2 or proba is None:
            raise HTTPException(status_code=400, detail='ROC requires binary classification with probabilities')
        # Compute simple ROC curve
        try:
            import numpy as np
            y_arr = np.array(y_true)
            # assume order corresponds to proba rows
            prob_pos = np.array([row[1] for row in proba]) if len(proba[0])==2 else None
            if prob_pos is None:
                raise ValueError('Probability array not binary')
            thresholds = np.linspace(0,1,101)
            tpr = []
            fpr = []
            pos = y_arr == unique[1]
            neg = ~pos
            for th in thresholds:
                pred_pos = prob_pos >= th
                tp = (pred_pos & pos).sum()
                fp = (pred_pos & neg).sum()
                fn = (~pred_pos & pos).sum()
                tn = (~pred_pos & neg).sum()
                tpr.append(tp / (tp+fn) if (tp+fn)>0 else 0.0)
                fpr.append(fp / (fp+tn) if (fp+tn)>0 else 0.0)
            data = {'fpr': list(map(float,fpr)), 'tpr': list(map(float,tpr))}
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'ROC generation failed: {e}')
    elif kind == 'acf':
        acf_vals = rec.get('_ts_acf')
        lags = rec.get('_ts_acf_lags')
        if not acf_vals or not lags:
            raise HTTPException(status_code=400, detail='Autocorrelation diagnostics not available for this run')
        data = {
            'lags': lags,
            'acf': acf_vals
        }
        total = len(acf_vals)
    elif kind == 'pacf':
        pacf_vals = rec.get('_ts_pacf')
        lags = rec.get('_ts_acf_lags')
        if not pacf_vals or not lags:
            raise HTTPException(status_code=400, detail='Partial autocorrelation diagnostics not available for this run')
        data = {
            'lags': lags,
            'pacf': pacf_vals
        }
        total = len(pacf_vals)
    elif kind == 'ts_diagnostics':
        residuals = rec.get('_ts_residuals') or []
        residual_index = rec.get('_ts_residual_index') or []
        details = rec.get('time_series_details') or {}
        data = {
            'residuals': {
                'index': residual_index,
                'values': residuals
            },
            'details': details
        }
        total = len(residuals)
    elif kind == 'forecast':
        forecast_index = rec.get('_ts_forecast_index')
        forecast_mean = rec.get('_ts_forecast_mean')
        if not forecast_index or not forecast_mean:
            raise HTTPException(status_code=400, detail='Forecast data not available for this run')
        data = {
            'forecast_index': forecast_index,
            'forecast_mean': forecast_mean,
            'forecast_lower': rec.get('_ts_forecast_lower'),
            'forecast_upper': rec.get('_ts_forecast_upper'),
            'history_index': rec.get('_ts_series_index'),
            'history_values': rec.get('_ts_series_values')
        }
        total = len(forecast_mean)
    elif kind == 'qq_plot':
        # Q-Q plot for residuals (regression only)
        if problem_type != 'regression':
            raise HTTPException(status_code=400, detail='Q-Q plot only for regression')
        try:
            import numpy as np
            import scipy.stats as stats
            residuals = np.array([y_true[i] - y_pred[i] for i in range(len(y_true))])
            # Sample if too many points
            if len(residuals) > request.max_points:
                random.seed(44)
                sample_idx = random.sample(range(len(residuals)), request.max_points)
                residuals = residuals[sample_idx]
            
            # Compute theoretical quantiles
            residuals_sorted = np.sort(residuals)
            n = len(residuals_sorted)
            theoretical_quantiles = stats.norm.ppf(np.linspace(0.5/n, 1-0.5/n, n))
            
            data = {
                'theoretical': list(map(float, theoretical_quantiles)),
                'sample': list(map(float, residuals_sorted))
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'Q-Q plot generation failed: {e}')
    elif kind == 'feature_importance':
        # Feature importance plot
        feature_importance = rec.get('feature_importance', [])
        if not feature_importance:
            raise HTTPException(status_code=400, detail='No feature importance data available')
        
        data = {
            'features': [item['feature'] for item in feature_importance],
            'importance': [item['importance'] for item in feature_importance]
        }
    elif kind == 'residuals_vs_fitted':
        # Residuals vs fitted values plot (regression only)
        if problem_type != 'regression':
            raise HTTPException(status_code=400, detail='Residuals vs fitted plot only for regression')
        try:
            residuals = [y_true[i] - y_pred[i] for i in range(len(y_true))]
            fitted = y_pred.copy()
            
            # Sample if too many points
            if len(residuals) > request.max_points:
                random.seed(45)
                sample_idx = random.sample(range(len(residuals)), request.max_points)
                residuals = [residuals[i] for i in sample_idx]
                fitted = [fitted[i] for i in sample_idx]
            
            data = {
                'fitted': fitted,
                'residuals': residuals
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f'Residuals vs fitted plot generation failed: {e}')
    else:
        raise HTTPException(status_code=400, detail='Unsupported visual kind')
    if kind in ('pred_vs_actual', 'residuals'):
        sampled = len(idx)
    elif kind in ('acf', 'pacf'):
        sampled = len(data.get('lags', []))
    elif kind == 'ts_diagnostics':
        sampled = len(data.get('residuals', {}).get('values', []))
    elif kind == 'forecast':
        sampled = len(data.get('forecast_mean', []))
    else:
        sampled = len(y_true) if y_true is not None else total

    return schemas.ModelVisualResponse(
        run_id=request.run_id,
        kind=kind,
        problem_type=problem_type,
        sampled=sampled,
        total=total,
        data=data
    )

@router.get('/datasets/{dataset_id}/model/runs', response_model=schemas.ListModelRunsResponse)
async def list_model_runs(dataset_id: int, db: Session = Depends(get_db)):
    _ = _get_dataset_or_404(dataset_id, db)
    runs = [schemas.ModelRunResponse(**r) for r in _MODEL_RUNS.values() if r['dataset_id']==dataset_id]
    runs.sort(key=lambda r: r.created_at, reverse=True)
    return schemas.ListModelRunsResponse(runs=runs)

@router.get('/datasets/{dataset_id}/model/runs/{run_id}', response_model=schemas.ModelRunResponse)
async def get_model_run(dataset_id: int, run_id: str, db: Session = Depends(get_db)):
    _ = _get_dataset_or_404(dataset_id, db)
    rec = _MODEL_RUNS.get(run_id)
    if not rec or rec['dataset_id'] != dataset_id:
        raise HTTPException(status_code=404, detail='Model run not found')
    return schemas.ModelRunResponse(**rec)
