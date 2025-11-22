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
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useWallet } from '@solana/wallet-adapter-react';
import { TrendingUp, Calendar, Download, RefreshCw, AlertCircle } from 'lucide-react';

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
  refreshTrigger?: number; 
  onDataLoaded?: (data: PortfolioHistory[]) => void;
  portfolioHistory?: PortfolioHistory[]; 
}

type TimeRange = '7d' | '30d' | '90d' | '1y' | 'all';

export function PortfolioChart({ 
  className = '', 
  refreshTrigger = 0, 
  onDataLoaded, 
  portfolioHistory: externalPortfolioHistory 
}: PortfolioChartProps) {
  const { publicKey } = useWallet();
  const [internalPortfolioHistory, setInternalPortfolioHistory] = useState<PortfolioHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [showRefreshStatus, setShowRefreshStatus] = useState(false);

  const portfolioHistory = externalPortfolioHistory || internalPortfolioHistory;

  useEffect(() => {
    if (externalPortfolioHistory) {
      console.log('using external portfolio history data:', externalPortfolioHistory.length, 'records');
      setLoading(false);
      setError('');
      setLastRefresh(new Date());
      return;
    }
    
    if (!publicKey) return;
    loadPortfolioHistory();
  }, [publicKey, refreshTrigger, externalPortfolioHistory]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'portfoliodataupdated' && publicKey) {
        console.log('portfolio data updated detected, refreshing chart...');
        loadPortfolioHistory();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [publicKey]);

  useEffect(() => {
    const handlePortfolioUpdate = () => {
      if (publicKey) {
        console.log('portfolio update event received, refreshing chart...');
        loadPortfolioHistory();
      }
    };

    window.addEventListener('portfolioUpdated', handlePortfolioUpdate);
    return () => window.removeEventListener('portfolioUpdated', handlePortfolioUpdate);
  }, [publicKey]);

  const loadPortfolioHistory = async () => {
    if (!publicKey) return;

    if (externalPortfolioHistory) {
      console.log('📊 Skipping load - using external portfolio data');
      return;
    }

    setLoading(true);
    setError('');
    try {
      console.log('🔄 Loading portfolio history for chart...');
      const historyQuery = query(
        collection(db, 'solo-users', publicKey.toString(), 'portfolioHistory'),
        orderBy('timestamp', 'asc')
      );
      const querySnapshot = await getDocs(historyQuery);
      
      console.log(`📊 Found ${querySnapshot.docs.length} raw records from Firestore`);
      
      const history = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const record = {
          timestamp: data.timestamp?.toDate() || new Date(),
          totalValue: data.totalValue || 0,
          walletCount: data.walletCount || 0,
          tokenCount: data.tokenCount || 0
        };
        console.log('📝 Record:', record);
        return record;
      }).filter(record => record.totalValue > 0) as PortfolioHistory[];
      
      setInternalPortfolioHistory(history);
      setLastRefresh(new Date());
      
      console.log('✅ Loaded portfolio history for chart:', history.length, 'records');
      
      if (onDataLoaded) {
        onDataLoaded(history);
      }
    } catch (err) {
      console.error('❌ Failed to load portfolio history:', err);
      setError('Failed to load portfolio history. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    setShowRefreshStatus(true);
    console.log('🔄 Manual refresh initiated...');
    
    try {
      await loadPortfolioHistory();
      console.log('✅ Manual refresh completed');
    } catch (error) {
      console.error('❌ Manual refresh failed:', error);
    } finally {
      setRefreshing(false);
      // Hide status after 3 seconds
      setTimeout(() => setShowRefreshStatus(false), 3000);
    }
  };

  const triggerRefresh = () => {
    console.log('manual refresh triggered for portfolio chart');
    refreshData();
  };

  useEffect(() => {
    (window as any).refreshPortfolioChart = triggerRefresh;
    return () => {
      delete (window as any).refreshPortfolioChart;
    };
  }, []);

  const filterDataByTimeRange = (data: PortfolioHistory[]): PortfolioHistory[] => {
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

    if (diffDays <= 7) {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } else if (diffDays <= 90) {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        year: 'numeric'
      });
    }
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
          label: function(context: any) {
            return `$${context.parsed.y.toLocaleString(undefined, { 
              minimumFractionDigits: 2, 
              maximumFractionDigits: 2 
            })}`;
          },
          title: function(tooltipItems: any[]) {
            const item = portfolioHistory.find(item => 
              formatDate(item.timestamp) === tooltipItems[0].label
            );
            if (item) {
              return item.timestamp.toLocaleString();
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
        },
      },
      y: {
        grid: {
          color: 'rgba(75, 85, 99, 0.2)',
        },
        ticks: {
          color: 'rgb(156, 163, 175)',
          callback: function(value: any) {
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

  // Add debug information
  const debugInfo = {
    totalRecords: portfolioHistory.length,
    filteredRecords: filterDataByTimeRange(portfolioHistory).length,
    publicKey: publicKey?.toString(),
    usingExternalData: !!externalPortfolioHistory,
    lastRefresh: lastRefresh.toISOString()
  };

  if (!publicKey) {
    return (
      <div className={`bg-gray-800/50 rounded-xl p-6 border border-gray-700 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <TrendingUp className="h-12 w-12 text-gray-500 mx-auto mb-3" />
            <p className="text-gray-400">connect your wallet to view portfolio history</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !externalPortfolioHistory) {
    return (
      <div className={`bg-gray-800/50 rounded-xl p-6 border border-gray-700 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 text-purple-400 animate-spin mx-auto mb-3" />
            <p className="text-gray-400">loading portfolio history...</p>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
  const handleAnalysisComplete = (event: CustomEvent) => {
    const { totalValue, walletCount, tokenCount, timestamp } = event.detail;
    const newRecord = {
      timestamp: new Date(timestamp),
      totalValue,
      walletCount,
      tokenCount
    };
    
    setInternalPortfolioHistory(prev => [...prev, newRecord]);
    console.log('immediate chart update with new analysis data');
  };

  window.addEventListener('portfolioAnalysisComplete', handleAnalysisComplete as EventListener);
  return () => window.removeEventListener('portfolioAnalysisComplete', handleAnalysisComplete as EventListener);
}, []);

  if (error) {
    return (
      <div className={`bg-gray-800/50 rounded-xl p-6 border border-gray-700 ${className}`}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <p className="text-red-400 mb-3">{error}</p>
            <button
              onClick={refreshData}
              className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
            >
              try again
            </button>
          </div>
        </div>
      </div>
    );
  }

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
              {externalPortfolioHistory && (
                <span className="ml-2 text-green-500 lowercase">• live data</span>
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

          {/* Refresh Button - Enhanced */}
          {!externalPortfolioHistory && (
            <button
              onClick={refreshData}
              disabled={refreshing}
              className="flex items-center space-x-2 p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh chart data"
            >
              <RefreshCw className={`h-4 w-4 text-white ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-sm text-white hidden sm:inline">
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Refresh Status Banner */}
      {showRefreshStatus && (
        <div className={`mb-4 p-3 rounded-lg border ${
          refreshing 
            ? 'bg-blue-500/20 border-blue-500 text-blue-300' 
            : 'bg-green-500/20 border-green-500 text-green-300'
        }`}>
          <div className="flex items-center space-x-2">
            {refreshing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span className="text-sm">Refreshing portfolio data...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Portfolio data refreshed successfully!</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Enhanced Refresh Section */}
      {!externalPortfolioHistory && portfolioHistory.length > 0 && (
        <div className="mb-6 p-4 bg-gray-700/30 rounded-lg border border-gray-600">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-3 sm:space-y-0">
            <div className="flex items-center space-x-3">
              <RefreshCw className="h-5 w-5 text-purple-400" />
              <div>
                <h3 className="text-sm font-medium">data refresh</h3>
                <p className="text-xs text-gray-400">
                  Last refresh: {lastRefresh.toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={refreshData}
                disabled={refreshing}
                className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
              </button>
              <button
                onClick={() => console.log('Debug Info:', debugInfo)}
                className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded-lg transition-colors"
                title="View debug info in console"
              >
                <AlertCircle className="h-4 w-4" />
                <span>Debug</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
                analyze your wallets to start tracking performance
              </p>
              {!externalPortfolioHistory && (
                <button
                  onClick={refreshData}
                  className="mt-4 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Check for Data
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {portfolioHistory.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-700">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">
              ${portfolioHistory[portfolioHistory.length - 1]?.totalValue.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </div>
            <div className="text-sm text-gray-400">current value</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">
              {portfolioHistory[portfolioHistory.length - 1]?.walletCount || 0}
            </div>
            <div className="text-sm text-gray-400">wallets</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">
              {portfolioHistory[portfolioHistory.length - 1]?.tokenCount || 0}
            </div>
            <div className="text-sm text-gray-400">tokens</div>
          </div>
        </div>
      )}
    </div>
  );
}