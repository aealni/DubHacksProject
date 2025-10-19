import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Scatter, Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ModelVisualizationProps {
  visualizationData: any;
  onClose: () => void;
}

export default function ModelVisualization({ visualizationData, onClose }: ModelVisualizationProps) {
  if (!visualizationData) return null;

  const { kind, data, problem_type, sampled, total } = visualizationData;

  const renderChart = () => {
    switch (kind) {
      case 'pred_vs_actual':
        return renderPredVsActual();
      case 'residuals':
        return renderResiduals();
      case 'qq_plot':
        return renderQQPlot();
      case 'residuals_vs_fitted':
        return renderResidualsVsFitted();
      case 'confusion_matrix':
        return renderConfusionMatrix();
      case 'roc':
        return renderROC();
      case 'feature_importance':
        return renderFeatureImportance();
      default:
        return <div className="text-red-600">Unsupported visualization type: {kind}</div>;
    }
  };

  const renderPredVsActual = () => {
    const chartData = {
      datasets: [
        {
          label: 'Predictions vs Actual',
          data: data.actual?.map((actual: number, index: number) => ({
            x: actual,
            y: data.pred[index]
          })) || [],
          backgroundColor: 'rgba(99, 102, 241, 0.6)',
          borderColor: 'rgba(99, 102, 241, 1)',
          borderWidth: 1,
          pointRadius: 3,
        }
      ]
    };

    const options = {
      responsive: true,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: true,
          text: 'Predicted vs Actual Values'
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Actual Values'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Predicted Values'
          }
        }
      }
    };

    return <Scatter data={chartData} options={options} />;
  };

  const renderResiduals = () => {
    const chartData = {
      datasets: [{
        label: 'Residuals',
        data: data.residuals?.map((residual: number, index: number) => ({
          x: index,
          y: residual
        })) || [],
        backgroundColor: 'rgba(34, 197, 94, 0.6)',
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 1,
        pointRadius: 2,
      }]
    };

    const options = {
      responsive: true,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: true,
          text: 'Residuals Plot'
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Observation Index'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Residuals'
          }
        }
      }
    };

    return <Scatter data={chartData} options={options} />;
  };

  const renderQQPlot = () => {
    const chartData = {
      datasets: [
        {
          label: 'Q-Q Plot',
          data: data.theoretical?.map((theoretical: number, index: number) => ({
            x: theoretical,
            y: data.sample[index]
          })) || [],
          backgroundColor: 'rgba(168, 85, 247, 0.6)',
          borderColor: 'rgba(168, 85, 247, 1)',
          borderWidth: 1,
          pointRadius: 2,
        }
      ]
    };

    const options = {
      responsive: true,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: true,
          text: 'Q-Q Plot (Normal Distribution)'
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Theoretical Quantiles'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Sample Quantiles'
          }
        }
      }
    };

    return <Scatter data={chartData} options={options} />;
  };

  const renderResidualsVsFitted = () => {
    const chartData = {
      datasets: [{
        label: 'Residuals vs Fitted',
        data: data.fitted?.map((fitted: number, index: number) => ({
          x: fitted,
          y: data.residuals[index]
        })) || [],
        backgroundColor: 'rgba(245, 158, 11, 0.6)',
        borderColor: 'rgba(245, 158, 11, 1)',
        borderWidth: 1,
        pointRadius: 2,
      }]
    };

    const options = {
      responsive: true,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: true,
          text: 'Residuals vs Fitted Values'
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Fitted Values'
          }
        },
        y: {
          title: {
            display: true,
            text: 'Residuals'
          }
        }
      }
    };

    return <Scatter data={chartData} options={options} />;
  };

  const renderROC = () => {
    const chartData = {
      datasets: [
        {
          label: 'ROC Curve',
          data: data.fpr?.map((fpr: number, index: number) => ({
            x: fpr,
            y: data.tpr[index]
          })) || [],
          backgroundColor: 'rgba(99, 102, 241, 0.6)',
          borderColor: 'rgba(99, 102, 241, 1)',
          borderWidth: 2,
          pointRadius: 1,
          showLine: true,
          fill: false,
        }
      ]
    };

    const options = {
      responsive: true,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: true,
          text: 'ROC Curve'
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'False Positive Rate'
          },
          min: 0,
          max: 1
        },
        y: {
          title: {
            display: true,
            text: 'True Positive Rate'
          },
          min: 0,
          max: 1
        }
      }
    };

    return <Scatter data={chartData} options={options} />;
  };

  const renderFeatureImportance = () => {
    const chartData = {
      labels: data.features?.slice(0, 15) || [], // Show top 15 features
      datasets: [{
        label: 'Feature Importance',
        data: data.importance?.slice(0, 15) || [],
        backgroundColor: 'rgba(34, 197, 94, 0.6)',
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 1,
      }]
    };

    const options = {
      responsive: true,
      indexAxis: 'y' as const,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        title: {
          display: true,
          text: 'Feature Importance (Top 15)'
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Importance Score'
          }
        }
      }
    };

    return <Bar data={chartData} options={options} />;
  };

  const renderConfusionMatrix = () => {
    if (!data.matrix || !data.labels) {
      return <div>No confusion matrix data available</div>;
    }

    return (
      <div className="overflow-auto">
        <table className="min-w-full border-collapse border border-gray-300">
          <thead>
            <tr>
              <th className="border border-gray-300 p-2 bg-gray-100"></th>
              <th colSpan={data.labels.length} className="border border-gray-300 p-2 bg-gray-100 text-center">
                Predicted
              </th>
            </tr>
            <tr>
              <th className="border border-gray-300 p-2 bg-gray-100">Actual</th>
              {data.labels.map((label: string) => (
                <th key={label} className="border border-gray-300 p-2 bg-gray-50 text-sm">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row: number[], rowIndex: number) => (
              <tr key={rowIndex}>
                <th className="border border-gray-300 p-2 bg-gray-50 text-sm">
                  {data.labels[rowIndex]}
                </th>
                {row.map((cell: number, colIndex: number) => (
                  <td
                    key={colIndex}
                    className={`border border-gray-300 p-2 text-center text-sm ${
                      rowIndex === colIndex ? 'bg-green-100' : 'bg-white'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const getTitle = () => {
    switch (kind) {
      case 'pred_vs_actual': return 'Predicted vs Actual Values';
      case 'residuals': return 'Residuals Distribution';
      case 'qq_plot': return 'Q-Q Plot';
      case 'residuals_vs_fitted': return 'Residuals vs Fitted Values';
      case 'confusion_matrix': return 'Confusion Matrix';
      case 'roc': return 'ROC Curve';
      case 'feature_importance': return 'Feature Importance';
      default: return 'Model Visualization';
    }
  };

  return (
    <div className="bg-white border border-gray-300 rounded-lg p-4 shadow-lg">
      <div className="flex justify-between items-center mb-3">
        <h5 className="text-sm font-semibold text-gray-700">
          {getTitle()}
        </h5>
        <button
          onClick={onClose}
          className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs"
        >
          ❌ Close
        </button>
      </div>
      
      <div className="text-xs text-gray-600 mb-3">
        Showing {sampled} of {total} data points
      </div>
      
      <div className="w-full h-80">
        {renderChart()}
      </div>
    </div>
  );
}