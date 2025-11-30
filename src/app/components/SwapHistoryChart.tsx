'use client';

import { useMemo, useState, useEffect } from 'react';
import { Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  ArcElement,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import { HistorySummaryPoint } from '../types/history';
import { Flame, DollarSign, Calendar, ArrowRightLeft, TrendingDown, Package, ChevronDown, Activity, Coins, RefreshCw } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  ArcElement,
  Tooltip,
  Legend,
);

interface SellIndicator {
  timestamp: number;
  valueUsd: number;
  token: string;
  outputToken?: string | { mint: string; symbol?: string };
  type?: 'liquidation' | 'swap';
}

interface SwapHistoryChartProps {
  summary?: HistorySummaryPoint[];
  sellIndicators: SellIndicator[];
  isLoading?: boolean;
}

export function SwapHistoryChart({
  summary,
  sellIndicators,
  isLoading = false,
}: SwapHistoryChartProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  const { liquidations, proRataSwaps } = useMemo(() => {
    if (!sellIndicators || !Array.isArray(sellIndicators)) {
      return { liquidations: [], proRataSwaps: [] };
    }

    const validIndicators = sellIndicators.filter(indicator => 
      indicator && 
      typeof indicator.valueUsd === 'number' && 
      indicator.timestamp && 
      indicator.token
    );

    const liquidations = validIndicators.filter(indicator => {
      let outputTokenMint: string | undefined;
      
      if (typeof indicator.outputToken === 'string') {
        outputTokenMint = indicator.outputToken;
      } else if (indicator.outputToken && typeof indicator.outputToken === 'object' && 'mint' in indicator.outputToken) {
        outputTokenMint = indicator.outputToken.mint;
      }
      
      return indicator.type === 'liquidation' || 
             outputTokenMint === USDC_MINT ||
             (!indicator.type && !outputTokenMint);
    });

    const proRataSwaps = validIndicators.filter(indicator => {
      let outputTokenMint: string | undefined;
      
      if (typeof indicator.outputToken === 'string') {
        outputTokenMint = indicator.outputToken;
      } else if (indicator.outputToken && typeof indicator.outputToken === 'object' && 'mint' in indicator.outputToken) {
        outputTokenMint = indicator.outputToken.mint;
      }
      
      return indicator.type === 'swap' || 
             (outputTokenMint && outputTokenMint !== USDC_MINT);
    });

    return { liquidations, proRataSwaps };
  }, [sellIndicators]);

  const combinedStats = useMemo(() => {
    const totalLiquidated = liquidations.reduce((sum, indicator) => sum + indicator.valueUsd, 0);
    const totalSwapped = proRataSwaps.reduce((sum, indicator) => sum + indicator.valueUsd, 0);
    const totalValue = totalLiquidated + totalSwapped;
    const totalTransactions = liquidations.length + proRataSwaps.length;

    return {
      totalLiquidated,
      totalSwapped,
      totalValue,
      totalTransactions,
      liquidationCount: liquidations.length,
      swapCount: proRataSwaps.length,
    };
  }, [liquidations, proRataSwaps]);

  const liquidationStats = useMemo(() => {
    const totalLiquidated = liquidations.reduce((sum, indicator) => sum + indicator.valueUsd, 0);
    
    const tokenStats = liquidations.reduce((acc, indicator) => {
      const tokenKey = indicator.token;
      if (!acc[tokenKey]) {
        acc[tokenKey] = {
          token: indicator.token,
          totalValue: 0,
          count: 0,
        };
      }
      acc[tokenKey].totalValue += indicator.valueUsd;
      acc[tokenKey].count += 1;
      return acc;
    }, {} as Record<string, { token: string; totalValue: number; count: number }>);

    const tokensByValue = Object.values(tokenStats)
      .sort((a, b) => b.totalValue - a.totalValue);

    const daysWithLiquidations = new Set(liquidations.map(indicator => 
      new Date(indicator.timestamp).toDateString()
    )).size;

    const averageDailyLiquidation = daysWithLiquidations > 0 ? totalLiquidated / daysWithLiquidations : 0;

    return {
      totalLiquidated,
      tokensByValue,
      averageDailyLiquidation,
      daysWithLiquidations,
      liquidationCount: liquidations.length,
    };
  }, [liquidations]);

  const swapStats = useMemo(() => {
    const totalSwapped = proRataSwaps.reduce((sum, indicator) => sum + indicator.valueUsd, 0);
    
    const tokenStats = proRataSwaps.reduce((acc, indicator) => {
      const tokenKey = indicator.token;
      if (!acc[tokenKey]) {
        acc[tokenKey] = {
          token: indicator.token,
          totalValue: 0,
          count: 0,
        };
      }
      acc[tokenKey].totalValue += indicator.valueUsd;
      acc[tokenKey].count += 1;
      return acc;
    }, {} as Record<string, { token: string; totalValue: number; count: number }>);

    const tokensByValue = Object.values(tokenStats)
      .sort((a, b) => b.totalValue - a.totalValue);

    const daysWithSwaps = new Set(proRataSwaps.map(indicator => 
      new Date(indicator.timestamp).toDateString()
    )).size;

    const averageDailySwap = daysWithSwaps > 0 ? totalSwapped / daysWithSwaps : 0;

    return {
      totalSwapped,
      tokensByValue,
      averageDailySwap,
      daysWithSwaps,
      swapCount: proRataSwaps.length,
    };
  }, [proRataSwaps]);

  const getMonochromeColors = (count: number) => {
    const colorPalette = [
      'rgba(255, 255, 255, 0.9)',
      'rgba(229, 231, 235, 0.9)',
      'rgba(209, 213, 219, 0.9)',
      'rgba(156, 163, 175, 0.9)',
      'rgba(107, 114, 128, 0.9)',
      'rgba(75, 85, 99, 0.9)',
      'rgba(55, 65, 81, 0.9)',
      'rgba(31, 41, 55, 0.9)',
    ];

    return colorPalette.slice(0, count);
  };

  const createPieData = (tokensByValue: { token: string; totalValue: number; count: number }[]) => {
    if (tokensByValue.length === 0) {
      return {
        labels: ['No Data'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['rgba(156, 163, 175, 0.9)'],
            borderColor: 'rgba(0, 0, 0, 0.8)',
            borderWidth: 2,
          },
        ],
      };
    }

    const topTokens = tokensByValue.slice(0, 6);
    const others = tokensByValue.slice(6);
    
    const othersTotal = others.reduce((sum, token) => sum + token.totalValue, 0);

    const labels = topTokens.map(token => token.token);
    const data = topTokens.map(token => token.totalValue);

    if (othersTotal > 0) {
      labels.push('others');
      data.push(othersTotal);
    }

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: getMonochromeColors(labels.length),
          borderColor: 'rgba(0, 0, 0, 0.8)',
          borderWidth: 2,
          hoverBorderColor: 'rgba(255, 255, 255, 0.9)',
          hoverBorderWidth: 3,
          hoverOffset: 12,
        },
      ],
    };
  };

  const liquidationPieData = useMemo(() => 
    createPieData(liquidationStats.tokensByValue), 
    [liquidationStats.tokensByValue]
  );

  const swapPieData = useMemo(() => 
    createPieData(swapStats.tokensByValue), 
    [swapStats.tokensByValue]
  );

  const pieChartOptions: ChartOptions<'pie'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: 'rgb(229, 231, 235)',
            font: {
              size: 13,
              weight: 600,
            },
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          titleColor: 'rgb(229, 231, 235)',
          bodyColor: 'rgb(255, 255, 255)',
          titleFont: {
            size: 13,
            weight: 600,
          },
          bodyFont: {
            size: 12,
            weight: 500,
          },
          padding: 12,
          cornerRadius: 6,
          displayColors: true,
          callbacks: {
            label: (context) => {
              const value = context.parsed;
              const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return ` ${context.label}: $${value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} (${percentage}%)`;
            },
          },
        },
      },
    }),
    [],
  );

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  useEffect(() => {
    if (sellIndicators && sellIndicators.length > 0) {
    }
  }, [sellIndicators, liquidations, proRataSwaps]);

  if (isLoading) {
    return (
      <div className="bg-black/90 border border-gray-700 rounded-none sm:rounded-xl overflow-hidden">
        <div className="w-full p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-lg border border-gray-600">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">transaction analytics</h3>
              <p className="text-sm text-gray-300">Loading history...</p>
            </div>
          </div>
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
        </div>
      </div>
    );
  }

  if (!sellIndicators || sellIndicators.length === 0) {
    return (
      <div className="bg-black/90 border border-gray-700 rounded-none sm:rounded-xl overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-800/30 transition-colors border-b border-gray-700"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/10 rounded-lg border border-gray-600">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">transaction analytics</h3>
              <p className="text-sm text-gray-300">no transaction history yet</p>
            </div>
          </div>
          <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-black/90 border border-gray-700 rounded-none sm:rounded-xl overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-800/30 transition-colors border-b border-gray-700"
      >
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-white/10 rounded-lg border border-gray-600">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">transaction analytics</h3>
            <p className="text-sm text-gray-300">
              {combinedStats.totalTransactions} transactions • ${combinedStats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
          </div>
          <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-green-500/50 transition-colors">
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Coins className="h-4 w-4 text-green-400" />
                <span className="text-xs font-semibold text-gray-300 tracking-wide">pro-rata to usdc</span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-green-400">
                ${combinedStats.totalLiquidated.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {combinedStats.liquidationCount} liquidation{combinedStats.liquidationCount !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Swapped Pro-rata */}
            <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-blue-500/50 transition-colors">
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <RefreshCw className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold text-gray-300 tracking-wide">pro-rata to other</span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-blue-400">
                ${combinedStats.totalSwapped.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {combinedStats.swapCount} swap{combinedStats.swapCount !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-gray-500 transition-colors">
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <ArrowRightLeft className="h-4 w-4 text-white" />
                <span className="text-xs font-semibold text-gray-300 tracking-wide">total txs</span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-white">
                {combinedStats.totalTransactions}
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-gray-500 transition-colors">
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Calendar className="h-4 w-4 text-white" />
                <span className="text-xs font-semibold text-gray-300 tracking-wide">active days</span>
              </div>
              <div className="text-lg sm:text-xl font-bold text-white">
                {Math.max(liquidationStats.daysWithLiquidations, swapStats.daysWithSwaps)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Liquidation Pie Chart */}
            {liquidationStats.liquidationCount > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-4 sm:p-6 hover:border-green-500/30 transition-colors">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-green-500/20 rounded-lg border border-green-500/30">
                    <Coins className="h-5 w-5 text-green-400" />
                  </div>
                  <h3 className="text-base font-bold text-white">pro-rata to usdc</h3>
                </div>
                <div className="h-64">
                  <Pie data={liquidationPieData} options={pieChartOptions} />
                </div>
                <div className="mt-3 text-center">
                  <span className="text-xs font-medium text-gray-400 bg-gray-800 px-3 py-1 rounded-full border border-gray-600">
                    {liquidationStats.liquidationCount} token{liquidationStats.liquidationCount !== 1 ? 's' : ''} liquidated to USDC
                  </span>
                </div>
              </div>
            )}

            {/* Pro-rata Swap Pie Chart */}
            {swapStats.swapCount > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-4 sm:p-6 hover:border-blue-500/30 transition-colors">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                    <RefreshCw className="h-5 w-5 text-blue-400" />
                  </div>
                  <h3 className="text-base font-bold text-white">pro-rata to other</h3>
                </div>
                <div className="h-64">
                  <Pie data={swapPieData} options={pieChartOptions} />
                </div>
                <div className="mt-3 text-center">
                  <span className="text-xs font-medium text-gray-400 bg-gray-800 px-3 py-1 rounded-full border border-gray-600">
                    {swapStats.swapCount} token{swapStats.swapCount !== 1 ? 's' : ''} swapped pro-rata
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Recent Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Recent Liquidations */}
            {liquidations.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-4 sm:p-6 hover:border-green-500/30 transition-colors">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-green-500/20 rounded-lg border border-green-500/30">
                    <Flame className="h-5 w-5 text-green-400" />
                  </div>
                  <h3 className="text-base font-bold text-white">recent liquidations to usdc</h3>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {liquidations
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 6)
                    .map((indicator, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 sm:p-4 bg-gray-800/50 rounded-lg border border-green-500/20 hover:border-green-400/40 transition-all duration-200 hover:bg-gray-700/30"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                          <div>
                            <div className="text-sm font-semibold text-white lowercase">
                              {indicator.token}
                            </div>
                            <div className="text-xs text-gray-300 lowercase">
                              {formatDate(indicator.timestamp)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-green-400">
                            ${indicator.valueUsd.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          <div className="text-xs text-green-300/70">to USDC</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Recent Pro-rata Swaps */}
            {proRataSwaps.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-4 sm:p-6 hover:border-blue-500/30 transition-colors">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                    <RefreshCw className="h-5 w-5 text-blue-400" />
                  </div>
                  <h3 className="text-base font-bold text-white">recent pro-rata swaps</h3>
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {proRataSwaps
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 6)
                    .map((indicator, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 sm:p-4 bg-gray-800/50 rounded-lg border border-blue-500/20 hover:border-blue-400/40 transition-all duration-200 hover:bg-gray-700/30"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                          <div>
                            <div className="text-sm font-semibold text-white lowercase">
                              {indicator.token}
                            </div>
                            <div className="text-xs text-gray-300 lowercase">
                              {formatDate(indicator.timestamp)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-blue-400">
                            ${indicator.valueUsd.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </div>
                          <div className="text-xs text-blue-300/70">pro-rata</div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}