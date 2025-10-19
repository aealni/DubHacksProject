from __future__ import annotations
import uuid
from datetime import datetime
from typing import Dict, Any, List

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session
"""Modeling endpoints. scikit-learn is optional for the rest of the app; we attempt
to import it here and set a flag. If it's not installed, modeling endpoints will
return a 503 with an actionable message instead of causing the whole app to fail
at import time.
"""

_SKLEARN_AVAILABLE = True
try:
    from sklearn.model_selection import train_test_split
    from sklearn.preprocessing import OneHotEncoder, StandardScaler
    from sklearn.compose import ColumnTransformer
    from sklearn.pipeline import Pipeline
    from sklearn.metrics import accuracy_score, f1_score, roc_auc_score, mean_squared_error, r2_score
    from sklearn.linear_model import LogisticRegression, LinearRegression
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
except Exception:  # pragma: no cover - best-effort import
    _SKLEARN_AVAILABLE = False
    # define placeholders to avoid NameError when referenced elsewhere
    train_test_split = None
    OneHotEncoder = None
    StandardScaler = None
    ColumnTransformer = None
    Pipeline = None
    accuracy_score = None
    f1_score = None
    roc_auc_score = None
    mean_squared_error = None
    r2_score = None
    LogisticRegression = None
    LinearRegression = None
    RandomForestClassifier = None
    RandomForestRegressor = None

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


def _build_pipeline(df: pd.DataFrame, target: str, req: schemas.ModelTaskRequest, problem_type: str):
    feature_cols = [c for c in df.columns if c != target and c != '_rowid']
    if req.include_columns:
        feature_cols = [c for c in feature_cols if c in req.include_columns]
    if req.exclude_columns:
        feature_cols = [c for c in feature_cols if c not in req.exclude_columns]
    if not feature_cols:
        raise HTTPException(status_code=400, detail="No feature columns available after filtering")

    X = df[feature_cols]
    y = df[target]

    # Drop rows with NA in y
    mask = y.notna()
    X = X.loc[mask]
    y = y.loc[mask]

    # Down-sample if needed
    if req.max_rows and len(X) > req.max_rows:
        X = X.sample(req.max_rows, random_state=req.random_state)
        y = y.loc[X.index]

    categorical = [c for c in X.columns if X[c].dtype == object]
    numeric = [c for c in X.columns if c not in categorical]

    transformers: List[Any] = []
    if categorical:
        handle = 'onehot'
        if req.encode_categoricals == 'ordinal':
            # simple ordinal encoding (factorize)
            for c in categorical:
                X[c] = pd.factorize(X[c])[0]
        else:
            transformers.append(('cat', OneHotEncoder(handle_unknown='ignore'), categorical))
    if numeric:
        if req.normalize_numeric:
            transformers.append(('num', StandardScaler(), numeric))

    if transformers:
        preprocessor = ColumnTransformer(transformers=transformers, remainder='passthrough')
    else:
        preprocessor = 'passthrough'

    if problem_type == 'classification':
        # Use LogisticRegression for coefficient statistics
        model = LogisticRegression(random_state=req.random_state, max_iter=1000)
    else:
        # Use LinearRegression for coefficient statistics  
        model = LinearRegression()

    pipe = Pipeline(steps=[('prep', preprocessor), ('model', model)])
    return X, y, pipe, feature_cols, categorical, numeric


def _compute_feature_importance(pipeline: Pipeline, feature_cols: List[str], categorical: List[str]) -> List[schemas.FeatureImportanceItem]:
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


def _compute_comprehensive_summary(pipeline: Pipeline, X_train, X_test, y_train, y_test, 
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
        X, y, pipeline, feature_cols, cat_cols, num_cols = _build_pipeline(df, request.target, request, problem_type)
        # Handle tiny class issues pre-split
        if problem_type == 'classification':
            value_counts = y.value_counts()
            too_small = value_counts[value_counts < 2]
            if len(value_counts) == 1:
                # Degenerate -> switch to regression if numeric else fail
                if pd.api.types.is_numeric_dtype(y):
                    problem_type = 'regression'
                else:
                    raise ValueError("Target has only one class; need at least two distinct classes for classification.")
            elif not value_counts.empty and not too_small.empty:
                # Drop rare classes (<2) if small fraction (<2% of data); else fallback to regression
                rare_idx = y.isin(too_small.index)
                rare_frac = rare_idx.mean()
                if rare_frac < 0.02:
                    X = X.loc[~rare_idx]
                    y = y.loc[~rare_idx]
                elif pd.api.types.is_numeric_dtype(y):
                    problem_type = 'regression'
                else:
                    raise ValueError(f"Classes with <2 samples present: {', '.join(too_small.index.astype(str))}.")
        stratify_arg = y if problem_type=='classification' else None
        try:
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=request.test_size, random_state=request.random_state, stratify=stratify_arg)
        except ValueError:
            # Retry without stratify
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=request.test_size, random_state=request.random_state, stratify=None)

        # If fallback changed problem_type, rebuild pipeline with appropriate estimator
        if pipeline.named_steps['model'].__class__.__name__.endswith('Classifier') and problem_type == 'regression':
            X2, y2, pipeline2, feature_cols2, cat_cols2, num_cols2 = _build_pipeline(df, request.target, request, 'regression')
            X, y, pipeline, feature_cols, cat_cols, num_cols = X2, y2, pipeline2, feature_cols2, cat_cols2, num_cols2
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=request.test_size, random_state=request.random_state, stratify=None)

        pipeline.fit(X_train, y_train)
        preds = pipeline.predict(X_test)
        metrics_primary = ''
        metric_value = 0.0
        additional: Dict[str, Any] = {}
        if problem_type == 'classification':
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
                        roc = roc_auc_score(y_test, proba[:,1])
                        additional['roc_auc'] = float(roc)
                except Exception:
                    pass
        else:
            metrics_primary = 'rmse'
            # Older sklearn versions may not support squared kwarg=False; fallback to manual sqrt.
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

        importances = _compute_feature_importance(pipeline, feature_cols, cat_cols)
        if request.top_n_importances and importances:
            importances = importances[:request.top_n_importances]

        # Compute comprehensive model summary
        comprehensive_summary = _compute_comprehensive_summary(
            pipeline, X_train, X_test, y_train, y_test, preds, problem_type, feature_cols
        )

        sample_size = min(25, len(preds))
        sample_rows: List[schemas.ModelPreviewRow] = []
        for idx in range(sample_size):
            sample_rows.append(schemas.ModelPreviewRow(row_index=int(X_test.index[idx]), prediction=preds[idx], actual=y_test.iloc[idx]))

        run_record.update({
            'status': 'completed',
            'problem_type': problem_type,
            'metrics': schemas.ModelMetrics(problem_type=problem_type, metric_primary=metrics_primary, metric_value=metric_value, additional=additional),
            'summary': comprehensive_summary,
            'feature_importance': importances,
            'sample_predictions': sample_rows,
            'completed_at': datetime.utcnow(),
            # Store raw arrays (truncate extremely large to conserve memory)
            '_y_test': y_test.tolist() if len(y_test) <= 50000 else y_test.head(50000).tolist(),
            '_preds': preds.tolist() if len(preds) <= 50000 else preds[:50000].tolist(),
            '_proba': (pipeline.predict_proba(X_test).tolist() if problem_type=='classification' and hasattr(pipeline.named_steps['model'], 'predict_proba') else None)
        })
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
    y_true = rec.get('_y_test')
    y_pred = rec.get('_preds')
    proba = rec.get('_proba')
    if y_true is None or y_pred is None:
        raise HTTPException(status_code=400, detail='Run lacks stored predictions')
    total = len(y_true)
    import random
    idx = list(range(total))
    if request.kind in ('pred_vs_actual','residuals') and total > request.max_points:
        random.seed(42)
        idx = random.sample(idx, request.max_points)
    # Build payload
    kind = request.kind
    problem_type = rec.get('problem_type','unknown')
    data: Dict[str, Any] = {}
    if kind == 'pred_vs_actual':
        data = {
            'actual': [y_true[i] for i in idx],
            'pred': [y_pred[i] for i in idx]
        }
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
    return schemas.ModelVisualResponse(
        run_id=request.run_id,
        kind=kind,
        problem_type=problem_type,
        sampled=len(idx) if kind in ('pred_vs_actual','residuals') else len(y_true),
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
