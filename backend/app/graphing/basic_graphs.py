"""
Basic graphing module for Mango data visualization.

This module provides a comprehensive set of visualization tools that integrate
with the existing dataset infrastructure. Users can create various types of
graphs with customizable options including colors, labels, spacing, and more.
"""

import json
import base64
from io import BytesIO
from typing import List, Dict, Any, Optional, Literal, Union
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns
import numpy as np

from ..models import Dataset
from ..pipeline import load_preview_from_sqlite, list_table_columns
from ..db import engine


# Chart type definitions (kept for documentation; runtime accepts any string)
ChartType = str

# Color palette options
ColorPalette = Literal[
    "viridis", "plasma", "inferno", "magma", "cividis",
    "Set1", "Set2", "Set3", "tab10", "tab20",
    "Blues", "Reds", "Greens", "Oranges", "Purples"
]


class GraphConfiguration:
    """Configuration class for customizing graph appearance and behavior."""
    
    def __init__(
        self,
        title: Optional[str] = None,
        xlabel: Optional[str] = None,
        ylabel: Optional[str] = None,
        color_palette: ColorPalette = "viridis",
        figsize: tuple = (10, 6),
        dpi: int = 100,
        style: str = "whitegrid",
        font_size: int = 12,
        title_size: int = 14,
        label_size: int = 10,
        rotation_x: int = 0,
        rotation_y: int = 0,
        grid: bool = True,
        legend: bool = True,
        tight_layout: bool = True,
        custom_colors: Optional[List[str]] = None,
        alpha: float = 0.8,
        line_width: float = 2.0,
        marker_size: int = 50,
        bins: int = 30,  # for histograms
        line_style: Optional[str] = None,
        line_color: Optional[str] = None,
        **kwargs
    ):
        self.title = title
        self.xlabel = xlabel
        self.ylabel = ylabel
        self.color_palette = color_palette
        self.figsize = figsize
        self.dpi = dpi
        self.style = style
        self.font_size = font_size
        self.title_size = title_size
        self.label_size = label_size
        self.rotation_x = rotation_x
        self.rotation_y = rotation_y
        self.grid = grid
        self.legend = legend
        self.tight_layout = tight_layout
        self.custom_colors = custom_colors
        self.alpha = alpha
        self.line_width = line_width
        self.marker_size = marker_size
        self.bins = bins
        self.line_style = line_style
        self.line_color = line_color
        self.kwargs = kwargs


class GraphGenerator:
    """Main class for generating various types of graphs from dataset data."""
    
    def __init__(self, dataset_id: int, db_engine: Any = None):
        self.dataset_id = dataset_id
        self.engine = db_engine or engine
        self._data_cache = None
        self._columns_cache = None
    
    def _get_data(self, limit: Optional[int] = None) -> pd.DataFrame:
        """Load data from the dataset, with optional caching."""
        if self._data_cache is None or limit:
            if limit:
                query = f"SELECT * FROM cleaned_{self.dataset_id} LIMIT {limit}"
                self._data_cache = pd.read_sql_query(query, self.engine)
            else:
                self._data_cache = pd.read_sql_query(
                    f"SELECT * FROM cleaned_{self.dataset_id}", self.engine
                )
        return self._data_cache

    # Public accessor for downstream packaging
    def get_dataframe(self) -> pd.DataFrame:
        return self._get_data()
    
    def _get_columns(self) -> List[str]:
        """Get list of available columns in the dataset."""
        if self._columns_cache is None:
            self._columns_cache = list_table_columns(self.dataset_id, self.engine)
        return self._columns_cache
    
    def _setup_plot_style(self, config: GraphConfiguration):
        """Apply common styling to matplotlib plots."""
        plt.style.use('default')
        sns.set_style(config.style)
        plt.rcParams.update({
            'font.size': config.font_size,
            'axes.titlesize': config.title_size,
            'axes.labelsize': config.label_size,
            'xtick.labelsize': config.label_size,
            'ytick.labelsize': config.label_size,
            'legend.fontsize': config.label_size,
            'figure.titlesize': config.title_size
        })
    
    def _apply_common_formatting(self, ax, config: GraphConfiguration):
        """Apply common formatting options to a plot."""
        if config.title:
            ax.set_title(config.title, fontsize=config.title_size, pad=20)
        if config.xlabel:
            ax.set_xlabel(config.xlabel, fontsize=config.label_size)
        if config.ylabel:
            ax.set_ylabel(config.ylabel, fontsize=config.label_size)
        
        if config.rotation_x != 0:
            plt.xticks(rotation=config.rotation_x)
        if config.rotation_y != 0:
            plt.yticks(rotation=config.rotation_y)
        
        if config.grid:
            ax.grid(True, alpha=0.3)
        
        if config.legend and ax.legend_:
            ax.legend()
    
    def _get_colors(self, config: GraphConfiguration, n_colors: int = 1) -> List[str]:
        """Get color list based on configuration."""
        if config.custom_colors:
            return config.custom_colors[:n_colors]
        if config.line_color:
            return [config.line_color for _ in range(n_colors)]
        
        if n_colors == 1:
            return [plt.cm.get_cmap(config.color_palette)(0.5)]
        
        cmap = plt.cm.get_cmap(config.color_palette)
        return [cmap(i / (n_colors - 1)) for i in range(n_colors)]
    
    def _save_plot_to_base64(self, config: GraphConfiguration) -> str:
        """Convert the current plot to base64 string."""
        if config.tight_layout:
            plt.tight_layout()
        
        buffer = BytesIO()
        plt.savefig(buffer, format='png', dpi=config.dpi, bbox_inches='tight')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        return image_base64

    def _resolve_custom_value(self, value: Any, data: pd.DataFrame) -> Any:
        """Resolve special placeholder values used in custom plot specifications."""
        if isinstance(value, str):
            if value.startswith('$column:'):
                column_name = value.split(':', 1)[1]
                if column_name not in data.columns:
                    raise ValueError(f"Column '{column_name}' not found in dataset")
                return data[column_name]
            if value.startswith('$column_values:'):
                column_name = value.split(':', 1)[1]
                if column_name not in data.columns:
                    raise ValueError(f"Column '{column_name}' not found in dataset")
                return data[column_name].dropna().values
            if value == '$dataframe':
                return data
            if value.startswith('$list:'):
                literal = value.split(':', 1)[1]
                return [item.strip() for item in literal.split(',') if item.strip()]

        if isinstance(value, dict):
            # Allow shorthand {"$column": "col"}
            if '$column' in value:
                column_name = value['$column']
                if column_name not in data.columns:
                    raise ValueError(f"Column '{column_name}' not found in dataset")
                return data[column_name]
            if '$column_values' in value:
                column_name = value['$column_values']
                if column_name not in data.columns:
                    raise ValueError(f"Column '{column_name}' not found in dataset")
                return data[column_name].dropna().values
            if '$dataframe' in value and value['$dataframe']:
                return data
            # Recursively resolve nested dictionaries
            return {k: self._resolve_custom_value(v, data) for k, v in value.items()}

        if isinstance(value, list):
            return [self._resolve_custom_value(v, data) for v in value]

        return value

    def create_custom_plot(
        self,
        spec: Dict[str, Any],
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Execute a custom Matplotlib/Seaborn/Pandas plotting call."""
        if spec is None:
            raise ValueError("Custom plot specification is required for custom chart types")

        if config is None:
            config = GraphConfiguration()

        data = self._get_data()
        self._setup_plot_style(config)

        function_name = spec.get('function')
        module = spec.get('module', 'axes')
        apply_formatting = spec.get('apply_formatting', True)

        if not function_name:
            raise ValueError("Custom plot specification must include a function name")

        args_spec = spec.get('args') or []
        kwargs_spec = spec.get('kwargs') or {}

        resolved_args = [self._resolve_custom_value(arg, data) for arg in args_spec]
        resolved_kwargs = {k: self._resolve_custom_value(v, data) for k, v in kwargs_spec.items()}

        fig, ax = plt.subplots(figsize=config.figsize)

        target_callable = None
        final_ax = ax

        try:
            if module == 'axes':
                target_callable = getattr(ax, function_name, None)
            elif module == 'pyplot':
                target_callable = getattr(plt, function_name, None)
                resolved_kwargs.setdefault('ax', ax)
            elif module == 'figure':
                target_callable = getattr(fig, function_name, None)
                final_ax = fig.gca()
            elif module == 'seaborn':
                target_callable = getattr(sns, function_name, None)
                resolved_kwargs.setdefault('ax', ax)
                resolved_kwargs.setdefault('data', data)
            elif module == 'pandas':
                plot_accessor = getattr(data, 'plot')
                # pandas.DataFrame.plot uses 'kind' keyword; allow overriding but default to function name
                resolved_kwargs.setdefault('ax', ax)
                resolved_kwargs.setdefault('kind', function_name)
                target_callable = plot_accessor
            else:
                raise ValueError(f"Unsupported module '{module}' in custom plot specification")
        except AttributeError:
            target_callable = None

        if not callable(target_callable):
            raise ValueError(f"Function '{function_name}' not found for module '{module}'")

        result = target_callable(*resolved_args, **resolved_kwargs)

        if hasattr(result, 'figure'):
            final_ax = result
        elif isinstance(result, tuple):
            # Attempt to find axis-like object within tuple result
            for item in result:
                if hasattr(item, 'figure'):
                    final_ax = item
                    break

        if apply_formatting and hasattr(final_ax, 'set_xlabel'):
            self._apply_common_formatting(final_ax, config)

        return self._save_plot_to_base64(config)

    def create_bar_chart(
        self, 
        x_column: str, 
        y_column: Optional[str] = None,
        config: Optional[GraphConfiguration] = None,
        aggregation: str = 'mean'
    ) -> str:
        """Create a bar chart.

        Behavior:
        - If y_column is None: category counts (frequency) for x_column.
        - If y_column provided: aggregate numeric values by chosen aggregation.
          Supported aggregations: count, sum, mean, median, min, max.
          If y_column is non-numeric, falls back to count of rows per category where y is non-null.
        """
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data()
        self._setup_plot_style(config)
        
        fig, ax = plt.subplots(figsize=config.figsize)
        
        if y_column is None:
            # Count plot
            value_counts = data[x_column].value_counts()
            colors = self._get_colors(config, len(value_counts))
            bars = ax.bar(range(len(value_counts)), value_counts.values, 
                         color=colors, alpha=config.alpha)
            ax.set_xticks(range(len(value_counts)))
            ax.set_xticklabels(value_counts.index)
            if not config.ylabel:
                config.ylabel = "Count"
        else:
            # Aggregated bar chart
            if data[y_column].dtype in ['object', 'category']:
                grouped = data.groupby(x_column)[y_column].count()
                if not config.ylabel:
                    config.ylabel = f"Count of {y_column}"
            else:
                agg_funcs = {
                    'count': 'count',
                    'sum': 'sum',
                    'mean': 'mean',
                    'median': 'median',
                    'min': 'min',
                    'max': 'max'
                }
                agg_key = agg_funcs.get(aggregation.lower(), 'mean')
                grouped = data.groupby(x_column)[y_column].agg(agg_key)
                if not config.ylabel:
                    config.ylabel = f"{aggregation.title()} of {y_column}"
            
            colors = self._get_colors(config, len(grouped))
            bars = ax.bar(grouped.index, grouped.values, color=colors, alpha=config.alpha)
        
        self._apply_common_formatting(ax, config)
        return self._save_plot_to_base64(config)

    def create_line_chart(
        self, 
        x_column: str, 
        y_column: str,
        group_by: Optional[str] = None,
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a line chart, optionally grouped by another column."""
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data()
        self._setup_plot_style(config)
        
        fig, ax = plt.subplots(figsize=config.figsize)
        
        line_style = config.line_style or '-'
        extra_kwargs = config.kwargs or {}
        
        if group_by is None:
            # Simple line plot
            data_sorted = data.sort_values(x_column)
            colors = self._get_colors(config, 1)
            color = colors[0] if colors else None
            ax.plot(
                data_sorted[x_column],
                data_sorted[y_column],
                linewidth=config.line_width,
                alpha=config.alpha,
                linestyle=line_style,
                color=color,
                **extra_kwargs
            )
        else:
            # Grouped line plot
            groups = data[group_by].unique()
            colors = self._get_colors(config, len(groups))
            
            for i, group in enumerate(groups):
                group_data = data[data[group_by] == group].sort_values(x_column)
                ax.plot(
                    group_data[x_column],
                    group_data[y_column],
                    label=str(group),
                    linewidth=config.line_width,
                    color=colors[i % len(colors)],
                    alpha=config.alpha,
                    linestyle=line_style,
                    **extra_kwargs
                )
        
        self._apply_common_formatting(ax, config)
        return self._save_plot_to_base64(config)

    def create_scatter_plot(
        self, 
        x_column: str, 
        y_column: str,
        color_by: Optional[str] = None,
        size_by: Optional[str] = None,
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a scatter plot with optional color and size encoding."""
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data()
        self._setup_plot_style(config)
        
        fig, ax = plt.subplots(figsize=config.figsize)
        
        # Prepare color and size parameters
        c = None
        s = config.marker_size
        
        if color_by:
            if data[color_by].dtype in ['object', 'category']:
                # Categorical coloring
                unique_cats = data[color_by].unique()
                colors = self._get_colors(config, len(unique_cats))
                color_map = dict(zip(unique_cats, colors))
                c = [color_map[cat] for cat in data[color_by]]
            else:
                # Continuous coloring
                c = data[color_by]
        
        if size_by and data[size_by].dtype not in ['object', 'category']:
            # Scale sizes appropriately
            size_values = data[size_by]
            s = ((size_values - size_values.min()) / 
                 (size_values.max() - size_values.min()) * 100 + 20)
        
        colors = None
        if color_by is None:
            colors_list = self._get_colors(config, 1)
            colors = colors_list[0] if colors_list else None

        scatter = ax.scatter(
            data[x_column],
            data[y_column],
            c=c if color_by else colors,
            s=s,
            alpha=config.alpha
        )
        
        # Add colorbar if using continuous color mapping
        if color_by and data[color_by].dtype not in ['object', 'category']:
            plt.colorbar(scatter, ax=ax, label=color_by)
        
        self._apply_common_formatting(ax, config)
        return self._save_plot_to_base64(config)

    def create_histogram(
        self, 
        column: str,
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a histogram for a numerical column."""
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data()
        self._setup_plot_style(config)
        
        fig, ax = plt.subplots(figsize=config.figsize)
        
        colors = self._get_colors(config, 1)
        ax.hist(data[column].dropna(), bins=config.bins, 
               color=colors[0], alpha=config.alpha, edgecolor='black')
        
        if not config.xlabel:
            config.xlabel = column
        if not config.ylabel:
            config.ylabel = "Frequency"
        
        self._apply_common_formatting(ax, config)
        return self._save_plot_to_base64(config)

    def create_box_plot(
        self, 
        y_column: str,
        x_column: Optional[str] = None,
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a box plot, optionally grouped by x_column."""
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data()
        self._setup_plot_style(config)
        
        fig, ax = plt.subplots(figsize=config.figsize)
        
        if x_column is None:
            # Single box plot
            ax.boxplot(data[y_column].dropna())
            ax.set_xticklabels([y_column])
        else:
            # Grouped box plot using seaborn for better handling
            sns.boxplot(data=data, x=x_column, y=y_column, ax=ax, 
                       palette=config.color_palette)
        
        self._apply_common_formatting(ax, config)
        return self._save_plot_to_base64(config)

    def create_violin_plot(
        self, 
        y_column: str,
        x_column: Optional[str] = None,
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a violin plot, optionally grouped by x_column."""
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data()
        self._setup_plot_style(config)
        
        fig, ax = plt.subplots(figsize=config.figsize)
        
        if x_column is None:
            # Single violin plot
            ax.violinplot(data[y_column].dropna())
        else:
            # Grouped violin plot
            sns.violinplot(data=data, x=x_column, y=y_column, ax=ax,
                          palette=config.color_palette)
        
        self._apply_common_formatting(ax, config)
        return self._save_plot_to_base64(config)

    def create_pie_chart(
        self, 
        column: str,
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a pie chart for categorical data."""
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data()
        self._setup_plot_style(config)
        
        fig, ax = plt.subplots(figsize=config.figsize)
        
        value_counts = data[column].value_counts()
        colors = self._get_colors(config, len(value_counts))
        
        wedges, texts, autotexts = ax.pie(value_counts.values, 
                                         labels=value_counts.index,
                                         colors=colors, 
                                         autopct='%1.1f%%',
                                         startangle=90)
        
        if config.title:
            ax.set_title(config.title, fontsize=config.title_size, pad=20)
        
        return self._save_plot_to_base64(config)

    def create_heatmap(
        self, 
        columns: Optional[List[str]] = None,
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a heatmap of the correlation matrix or specified columns."""
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data()
        self._setup_plot_style(config)
        
        if columns is None:
            # Use all numerical columns
            numeric_data = data.select_dtypes(include=[np.number])
        else:
            numeric_data = data[columns].select_dtypes(include=[np.number])
        
        fig, ax = plt.subplots(figsize=config.figsize)
        
        sns.heatmap(numeric_data.corr(), annot=True, cmap=config.color_palette,
                   center=0, square=True, ax=ax, cbar_kws={"shrink": .8})
        
        self._apply_common_formatting(ax, config)
        return self._save_plot_to_base64(config)

    def create_correlation_matrix(
        self, 
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a correlation matrix heatmap."""
        if config is None:
            config = GraphConfiguration(title="Correlation Matrix")
        return self.create_heatmap(config=config)

    def create_pairplot(
        self, 
        columns: Optional[List[str]] = None,
        color_by: Optional[str] = None,
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a pairplot matrix for exploring relationships between variables."""
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data(limit=1000)  # Limit for performance
        
        if columns is None:
            # Use all numerical columns (limit to first 5 for readability)
            numeric_cols = data.select_dtypes(include=[np.number]).columns[:5]
            plot_data = data[numeric_cols]
        else:
            plot_data = data[columns]
        
        # Add color column if specified
        if color_by and color_by in data.columns:
            plot_data = plot_data.copy()
            plot_data[color_by] = data[color_by]
        
        self._setup_plot_style(config)
        
        # Create pairplot
        g = sns.pairplot(plot_data, hue=color_by, palette=config.color_palette,
                        plot_kws={'alpha': config.alpha})
        
        if config.title:
            g.fig.suptitle(config.title, y=1.02, fontsize=config.title_size)
        
        if config.tight_layout:
            plt.tight_layout()
        
        buffer = BytesIO()
        g.savefig(buffer, format='png', dpi=config.dpi, bbox_inches='tight')
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.getvalue()).decode()
        plt.close()
        return image_base64

    def create_area_chart(
        self, 
        x_column: str, 
        y_columns: List[str],
        config: Optional[GraphConfiguration] = None
    ) -> str:
        """Create a stacked area chart."""
        if config is None:
            config = GraphConfiguration()
        
        data = self._get_data()
        self._setup_plot_style(config)
        
        fig, ax = plt.subplots(figsize=config.figsize)
        
        data_sorted = data.sort_values(x_column)
        colors = self._get_colors(config, len(y_columns))
        
        # Create stacked area chart
        y_data = [data_sorted[col].fillna(0) for col in y_columns]
        ax.stackplot(data_sorted[x_column], *y_data, 
                    labels=y_columns, colors=colors, alpha=config.alpha)
        
        self._apply_common_formatting(ax, config)
        return self._save_plot_to_base64(config)


def get_available_columns(dataset_id: int, db_engine: Any = None) -> Dict[str, List[str]]:
    """
    Get available columns for a dataset, categorized by data type.
    
    Returns:
        Dict with keys: 'numerical', 'categorical', 'datetime', 'all'
    """
    engine_to_use = db_engine or engine
    
    # Load a small sample to infer types
    sample_data = pd.read_sql_query(
        f"SELECT * FROM cleaned_{dataset_id} LIMIT 100", engine_to_use
    )
    
    numerical_cols = list(sample_data.select_dtypes(include=[np.number]).columns)
    categorical_cols = list(sample_data.select_dtypes(include=['object', 'category']).columns)
    datetime_cols = list(sample_data.select_dtypes(include=['datetime64']).columns)
    all_cols = list(sample_data.columns)
    
    return {
        'numerical': numerical_cols,
        'categorical': categorical_cols,
        'datetime': datetime_cols,
        'all': all_cols
    }


def validate_chart_parameters(
    chart_type: ChartType, 
    parameters: Dict[str, Any], 
    available_columns: Dict[str, List[str]]
) -> Dict[str, Any]:
    """
    Validate chart parameters based on chart type and available columns.
    
    Returns:
        Validated parameters or raises ValueError with helpful message.
    """
    validated = parameters.copy()
    
    # Required parameters for each chart type
    requirements = {
        'bar': ['x_column'],
        'line': ['x_column', 'y_column'],
        'scatter': ['x_column', 'y_column'],
        'histogram': ['column'],
        'box': ['y_column'],
        'violin': ['y_column'],
        'pie': ['column'],
        'heatmap': [],  # Optional columns
        'correlation': [],  # No required columns
        'pairplot': [],  # Optional columns
        'area': ['x_column', 'y_columns']
    }
    
    required_params = requirements.get(chart_type, [])
    
    # Check required parameters
    for param in required_params:
        if param not in validated or validated[param] is None:
            raise ValueError(f"Parameter '{param}' is required for {chart_type} chart")
    
    # Validate column existence
    all_columns = available_columns['all']
    
    for param_name, param_value in validated.items():
        if param_name.endswith('_column') or param_name == 'column':
            if param_value and param_value not in all_columns:
                raise ValueError(f"Column '{param_value}' not found in dataset")
        elif param_name.endswith('_columns') and isinstance(param_value, list):
            for col in param_value:
                if col not in all_columns:
                    raise ValueError(f"Column '{col}' not found in dataset")
    
    return validated


# Convenience functions for common chart types
def quick_bar_chart(dataset_id: int, x_column: str, title: str = None) -> str:
    """Quick bar chart with minimal configuration."""
    config = GraphConfiguration(title=title or f"Distribution of {x_column}")
    generator = GraphGenerator(dataset_id)
    return generator.create_bar_chart(x_column, config=config)


def quick_correlation_matrix(dataset_id: int, title: str = None) -> str:
    """Quick correlation matrix with minimal configuration."""
    config = GraphConfiguration(title=title or "Correlation Matrix", figsize=(12, 10))
    generator = GraphGenerator(dataset_id)
    return generator.create_correlation_matrix(config=config)


def quick_scatter_plot(
    dataset_id: int, 
    x_column: str, 
    y_column: str, 
    title: str = None
) -> str:
    """Quick scatter plot with minimal configuration."""
    config = GraphConfiguration(
        title=title or f"{y_column} vs {x_column}",
        xlabel=x_column,
        ylabel=y_column
    )
    generator = GraphGenerator(dataset_id)
    return generator.create_scatter_plot(x_column, y_column, config=config)
