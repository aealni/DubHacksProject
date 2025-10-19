"""
GraphQL router for creating visualizations from dataset data.

This router provides endpoints for generating various types of charts and graphs
from cleaned dataset data with customizable styling options.
"""

import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from ..db import get_db, engine
from .. import models, schemas
from ..graphing.basic_graphs import (
    GraphGenerator, 
    GraphConfiguration,
    get_available_columns,
    validate_chart_parameters,
    quick_bar_chart,
    quick_correlation_matrix,
    quick_scatter_plot
)

logger = logging.getLogger("mango.graphing")
router = APIRouter()


def _get_dataset_or_404(dataset_id: int, db: Session) -> models.Dataset:
    """Get dataset by ID or raise 404."""
    dataset = db.query(models.Dataset).filter(
        models.Dataset.id == dataset_id,
        models.Dataset.is_deleted == False
    ).first()
    
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    return dataset


def _convert_config_request_to_graph_config(
    config_request: schemas.GraphConfigRequest
) -> GraphConfiguration:
    """Convert API request config to internal GraphConfiguration."""
    return GraphConfiguration(
        title=config_request.title,
        xlabel=config_request.xlabel,
        ylabel=config_request.ylabel,
        color_palette=config_request.color_palette,
        figsize=config_request.figsize,
        dpi=config_request.dpi,
        style=config_request.style,
        font_size=config_request.font_size,
        title_size=config_request.title_size,
        label_size=config_request.label_size,
        rotation_x=config_request.rotation_x,
        rotation_y=config_request.rotation_y,
        grid=config_request.grid,
        legend=config_request.legend,
        tight_layout=config_request.tight_layout,
        custom_colors=config_request.custom_colors,
        alpha=config_request.alpha,
        line_width=config_request.line_width,
        marker_size=config_request.marker_size,
        bins=config_request.bins
    )


@router.get("/datasets/{dataset_id}/columns", response_model=schemas.AvailableColumnsResponse)
async def get_dataset_columns(
    dataset_id: int = Path(..., description="Dataset ID"),
    db: Session = Depends(get_db)
):
    """Get available columns for a dataset, categorized by data type."""
    dataset = _get_dataset_or_404(dataset_id, db)
    
    try:
        columns_info = get_available_columns(dataset_id, engine)
        return schemas.AvailableColumnsResponse(**columns_info)
    except Exception as e:
        logger.error(f"Error getting columns for dataset {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving dataset columns")
SUPPORTED_CHART_TYPES = {
    "bar", "line", "scatter", "histogram", "box", "violin",
    "pie", "heatmap", "correlation", "pairplot", "area"
}


@router.post("/datasets/{dataset_id}/graphs", response_model=schemas.GraphResponse)
async def create_graph(
    dataset_id: int = Path(..., description="Dataset ID"),
    request: schemas.CreateGraphRequest = ...,
    db: Session = Depends(get_db)
):
    """Create a graph from dataset data with customizable options."""
    dataset = _get_dataset_or_404(dataset_id, db)
    
    try:
        # Get available columns for validation
        available_columns = get_available_columns(dataset_id, engine)
        
        # Prepare parameters for validation
        parameters = {
            "x_column": request.x_column,
            "y_column": request.y_column,
            "y_columns": request.y_columns,
            "column": request.column,
            "columns": request.columns,
            "color_by": request.color_by,
            "size_by": request.size_by,
            "group_by": request.group_by
        }
        
        # Remove None values
        parameters = {k: v for k, v in parameters.items() if v is not None}
        
        chart_type = request.chart_type
        chart_type_key = chart_type.lower()

        # Validate parameters for supported chart types
        if chart_type_key in SUPPORTED_CHART_TYPES:
            validated_params = validate_chart_parameters(
                chart_type_key, parameters, available_columns
            )
        else:
            validated_params = parameters
        
        # Convert config
        config = None
        if request.config:
            config = _convert_config_request_to_graph_config(request.config)
        
        # Create graph generator
        generator = GraphGenerator(dataset_id, engine)
        
        # Generate the appropriate chart
        data_payload = None
        if chart_type_key == "bar":
            image_base64 = generator.create_bar_chart(
                validated_params["x_column"],
                validated_params.get("y_column"),
                config,
                request.aggregation or ('count' if not validated_params.get('y_column') else 'mean')
            )
            if request.return_data:
                df = generator.get_dataframe()
                x_col = validated_params["x_column"]
                y_col = validated_params.get("y_column")
                if y_col is None:
                    vc = df[x_col].value_counts()
                    data_payload = {
                        "labels": vc.index.tolist(),
                        "values": vc.values.tolist(),
                        "metric": "count"
                    }
                else:
                    # replicate aggregation logic
                    if df[y_col].dtype in ['object','category']:
                        grouped = df.groupby(x_col)[y_col].count()
                        metric = f"count({y_col})"
                    else:
                        agg = (request.aggregation or 'mean').lower()
                        allowed = {'count','sum','mean','median','min','max'}
                        if agg not in allowed:
                            agg = 'mean'
                        grouped = df.groupby(x_col)[y_col].agg(agg)
                        metric = f"{agg}({y_col})"
                    data_payload = {
                        "labels": list(map(str, grouped.index.tolist())),
                        "values": grouped.values.tolist(),
                        "metric": metric
                    }
        elif chart_type_key == "line":
            image_base64 = generator.create_line_chart(
                validated_params["x_column"],
                validated_params["y_column"],
                validated_params.get("group_by"),
                config
            )
            if request.return_data:
                df = generator.get_dataframe().sort_values(validated_params["x_column"])
                if validated_params.get("group_by"):
                    gb = validated_params["group_by"]
                    groups = []
                    for name, g in df.groupby(gb):
                        groups.append({
                            "group": str(name),
                            "x": g[validated_params["x_column"]].tolist(),
                            "y": g[validated_params["y_column"]].tolist()
                        })
                    data_payload = {"series": groups}
                else:
                    data_payload = {
                        "x": df[validated_params["x_column"]].tolist(),
                        "y": df[validated_params["y_column"]].tolist()
                    }
        elif chart_type_key == "scatter":
            image_base64 = generator.create_scatter_plot(
                validated_params["x_column"],
                validated_params["y_column"],
                validated_params.get("color_by"),
                validated_params.get("size_by"),
                config
            )
            if request.return_data:
                df = generator.get_dataframe()
                payload = {
                    "x": df[validated_params["x_column"]].tolist(),
                    "y": df[validated_params["y_column"]].tolist()
                }
                cb = validated_params.get("color_by")
                sb = validated_params.get("size_by")
                if cb and cb in df.columns:
                    payload["color_by"] = df[cb].astype(str).tolist()
                if sb and sb in df.columns:
                    payload["size_by"] = df[sb].tolist()
                data_payload = payload
        elif chart_type_key == "histogram":
            image_base64 = generator.create_histogram(
                validated_params["column"],
                config
            )
            if request.return_data:
                df = generator.get_dataframe()
                col = validated_params["column"]
                series = df[col].dropna().values
                import numpy as _np
                hist, bin_edges = _np.histogram(series, bins=config.bins if config else 30)
                data_payload = {
                    "bins": bin_edges.tolist(),
                    "counts": hist.tolist(),
                    "column": col
                }
        elif chart_type_key == "box":
            image_base64 = generator.create_box_plot(
                validated_params["y_column"],
                validated_params.get("x_column"),
                config
            )
        elif chart_type_key == "violin":
            image_base64 = generator.create_violin_plot(
                validated_params["y_column"],
                validated_params.get("x_column"),
                config
            )
        elif chart_type_key == "pie":
            image_base64 = generator.create_pie_chart(
                validated_params["column"],
                config
            )
        elif chart_type_key == "heatmap":
            image_base64 = generator.create_heatmap(
                validated_params.get("columns"),
                config
            )
        elif chart_type_key == "correlation":
            image_base64 = generator.create_correlation_matrix(config)
        elif chart_type_key == "pairplot":
            image_base64 = generator.create_pairplot(
                validated_params.get("columns"),
                validated_params.get("color_by"),
                config
            )
        elif chart_type_key == "area":
            image_base64 = generator.create_area_chart(
                validated_params["x_column"],
                validated_params["y_columns"],
                config
            )
        else:
            if request.custom_plot is None:
                raise HTTPException(status_code=400, detail=f"Unsupported chart type: {request.chart_type}")
            custom_spec = request.custom_plot.dict(exclude_none=True)
            image_base64 = generator.create_custom_plot(
                custom_spec,
                config
            )
            validated_params = {
                **validated_params,
                "custom_plot": custom_spec
            }
        
        return schemas.GraphResponse(
            chart_type=chart_type,
            image_base64=image_base64,
            parameters_used=validated_params,
            data=data_payload
        )
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error creating graph for dataset {dataset_id}: {e}")
        raise HTTPException(status_code=500, detail="Error creating graph")


@router.get("/datasets/{dataset_id}/graphs/quick/bar/{column}")
async def quick_bar_graph(
    dataset_id: int = Path(..., description="Dataset ID"),
    column: str = Path(..., description="Column name for bar chart"),
    title: str = None,
    db: Session = Depends(get_db)
):
    """Create a quick bar chart with minimal configuration."""
    dataset = _get_dataset_or_404(dataset_id, db)
    
    try:
        # Validate column exists
        available_columns = get_available_columns(dataset_id, engine)
        if column not in available_columns['all']:
            raise HTTPException(status_code=400, detail=f"Column '{column}' not found")
        
        image_base64 = quick_bar_chart(dataset_id, column, title)
        
        return schemas.GraphResponse(
            chart_type="bar",
            image_base64=image_base64,
            parameters_used={"x_column": column, "title": title}
        )
    
    except Exception as e:
        logger.error(f"Error creating quick bar chart: {e}")
        raise HTTPException(status_code=500, detail="Error creating quick bar chart")


@router.get("/datasets/{dataset_id}/graphs/quick/correlation")
async def quick_correlation_graph(
    dataset_id: int = Path(..., description="Dataset ID"),
    title: str = None,
    db: Session = Depends(get_db)
):
    """Create a quick correlation matrix with minimal configuration."""
    dataset = _get_dataset_or_404(dataset_id, db)
    
    try:
        image_base64 = quick_correlation_matrix(dataset_id, title)
        
        return schemas.GraphResponse(
            chart_type="correlation",
            image_base64=image_base64,
            parameters_used={"title": title}
        )
    
    except Exception as e:
        logger.error(f"Error creating quick correlation matrix: {e}")
        raise HTTPException(status_code=500, detail="Error creating correlation matrix")


@router.get("/datasets/{dataset_id}/graphs/quick/scatter/{x_column}/{y_column}")
async def quick_scatter_graph(
    dataset_id: int = Path(..., description="Dataset ID"),
    x_column: str = Path(..., description="X-axis column name"),
    y_column: str = Path(..., description="Y-axis column name"),
    title: str = None,
    db: Session = Depends(get_db)
):
    """Create a quick scatter plot with minimal configuration."""
    dataset = _get_dataset_or_404(dataset_id, db)
    
    try:
        # Validate columns exist
        available_columns = get_available_columns(dataset_id, engine)
        if x_column not in available_columns['all']:
            raise HTTPException(status_code=400, detail=f"Column '{x_column}' not found")
        if y_column not in available_columns['all']:
            raise HTTPException(status_code=400, detail=f"Column '{y_column}' not found")
        
        image_base64 = quick_scatter_plot(dataset_id, x_column, y_column, title)
        
        return schemas.GraphResponse(
            chart_type="scatter",
            image_base64=image_base64,
            parameters_used={"x_column": x_column, "y_column": y_column, "title": title}
        )
    
    except Exception as e:
        logger.error(f"Error creating quick scatter plot: {e}")
        raise HTTPException(status_code=500, detail="Error creating scatter plot")