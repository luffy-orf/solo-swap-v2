'use client';

import { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
} from 'chart.js';
import { TrendingUp, Calendar, Download } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

interface PortfolioHistory {
  timestamp: Date;
  totalValue: number;
  walletCount: number;
  tokenCount: number;
}

interface PortfolioChartProps {
  className?: string;
  portfolioHistory?: Array<{
    timestamp: Date;
    totalValue: number;
    walletCount: number;
    tokenCount: number;
  }>;
  livePortfolioValue?: number;
  liveTokenCount?: number;
  liveWalletCount?: number;
  mode?: string; 
}

type TimeRange = '7d' | '30d' | '90d' | '1y' | 'all';

export function PortfolioChart({ 
  className = '', 
  portfolioHistory = [],
  livePortfolioValue,
  liveTokenCount,
  liveWalletCount,
  mode = 'default'
}: PortfolioChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  useEffect(() => {
    if (portfolioHistory.length > 0) {
      setLastRefresh(new Date());
    }
  }, [portfolioHistory]);

  const filterDataByTimeRange = (data: PortfolioHistory[]): PortfolioHistory[] => {
    if (data.length === 0) return [];
    
    const now = new Date();
    const cutoffDate = new Date();

    switch (timeRange) {
      case '7d':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        cutoffDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        cutoffDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'all':
        return data;
    }

    return data.filter(item => item.timestamp >= cutoffDate);
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let formattedDate: string;

    if (diffDays <= 7) {
      formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (diffDays <= 90) {
      formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    } else {
      formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        year: 'numeric'
      });
    }

    // Convert to lowercase here instead of in the callback
    return formattedDate.toLowerCase();
  };

  const getChartData = () => {
    const filteredData = filterDataByTimeRange(portfolioHistory);
    
    if (filteredData.length === 0) {
      return {
        labels: ['no data available'],
        datasets: [
          {
            label: 'total portfolio value',
            data: [0],
            borderColor: 'rgb(139, 92, 246)',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            fill: true,
            tension: 0.4,
          },
        ],
      };
    }

    return {
      labels: filteredData.map(item => formatDate(item.timestamp)),
      datasets: [
        {
          label: 'total portfolio value',
          data: filteredData.map(item => item.totalValue),
          borderColor: 'rgb(139, 92, 246)',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointBackgroundColor: 'rgb(139, 92, 246)',
          pointBorderColor: 'white',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: false,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'rgb(156, 163, 175)',
        bodyColor: 'white',
        borderColor: 'rgba(139, 92, 246, 0.5)',
        borderWidth: 1,
        callbacks: {
          label: function(context: any): string {
            return `$${context.parsed.y.toLocaleString(undefined, { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}`;
          },
          title: function(tooltipItems: any[]): string {
            const item = portfolioHistory.find(item => 
              formatDate(item.timestamp) === tooltipItems[0].label
            );
            if (item) {
              return item.timestamp.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
              }).toLowerCase();
            }
            return tooltipItems[0].label;
          }
        }
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(75, 85, 99, 0.2)',
        },
        ticks: {
          color: 'rgb(156, 163, 175)',
          maxTicksLimit: 8,
          // No callback needed since we handle lowercase in formatDate
        },
      },
      y: {
        grid: {
          color: 'rgba(75, 85, 99, 0.2)',
        },
        ticks: {
          color: 'rgb(156, 163, 175)',
          callback: function(value: any): string {
            return '$' + value.toLocaleString();
          },
        },
        beginAtZero: true,
      },
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false,
    },
  };

  const getPerformanceStats = () => {
    if (portfolioHistory.length < 2) return null;

    const filteredData = filterDataByTimeRange(portfolioHistory);
    if (filteredData.length < 2) return null;

    const firstValue = filteredData[0].totalValue;
    const lastValue = filteredData[filteredData.length - 1].totalValue;
    const change = lastValue - firstValue;
    const percentageChange = firstValue > 0 ? (change / firstValue) * 100 : 0;

    return {
      change,
      percentageChange,
      isPositive: change >= 0
    };
  };

  const downloadChartData = () => {
    const csvContent = [
      ['date', 'total value', 'wallet count', 'token count'],
      ...portfolioHistory.map(item => [
        item.timestamp.toISOString(),
        item.totalValue.toString(),
        item.walletCount.toString(),
        item.tokenCount.toString()
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-history-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const performanceStats = getPerformanceStats();

  return (
    <div className={`bg-gray-800/50 rounded-xl p-6 border border-gray-700 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 space-y-3 sm:space-y-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <TrendingUp className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">portfolio performance</h2>
            <p className="text-sm text-gray-400">
              {portfolioHistory.length} records • {filterDataByTimeRange(portfolioHistory).length} shown
              {lastRefresh && (
                <span className="ml-2 text-gray-500 lowercase">
                  • updated: {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Performance Stats */}
          {performanceStats && (
            <div className={`px-3 py-1 rounded-lg ${
              performanceStats.isPositive 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              <div className="text-sm font-medium">
                {performanceStats.isPositive ? '+' : ''}{performanceStats.percentageChange.toFixed(2)}%
              </div>
              <div className="text-xs">
                {performanceStats.isPositive ? '+' : ''}${performanceStats.change.toLocaleString(undefined, { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}
              </div>
            </div>
          )}

          {/* Download Button */}
          {portfolioHistory.length > 0 && (
            <button
              onClick={downloadChartData}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              title="Download CSV"
            >
              <Download className="h-4 w-4 text-gray-300" />
            </button>
          )}
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="flex space-x-2 mb-6">
        {(['7d', '30d', '90d', '1y', 'all'] as TimeRange[]).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-3 py-1 text-sm rounded-lg transition-colors ${
              timeRange === range
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {range === '7d' ? '7d' : 
             range === '30d' ? '1m' : 
             range === '90d' ? '3m' : 
             range === '1y' ? '1y' : 'all'}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-80">
        {portfolioHistory.length > 0 ? (
          <Line data={getChartData()} options={chartOptions} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Calendar className="h-12 w-12 text-gray-500 mx-auto mb-3" />
              <p className="text-gray-400">no portfolio history available</p>
              <p className="text-sm text-gray-500 mt-1">
                analyze your portfolio to start tracking performance
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats - Use Live Data */}
      {(livePortfolioValue !== undefined || portfolioHistory.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-700">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              ${(livePortfolioValue !== undefined ? livePortfolioValue : portfolioHistory[portfolioHistory.length - 1]?.totalValue || 0).toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </div>
            <div className="text-sm text-gray-400">current value</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">
              {liveWalletCount !== undefined ? liveWalletCount : (portfolioHistory[portfolioHistory.length - 1]?.walletCount || 1)}
            </div>
            <div className="text-sm text-gray-400">wallets</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {liveTokenCount !== undefined ? liveTokenCount : (portfolioHistory[portfolioHistory.length - 1]?.tokenCount || 0)}
            </div>
            <div className="text-sm text-gray-400">tokens</div>
          </div>
        </div>
      )}
    </div>
  );
}