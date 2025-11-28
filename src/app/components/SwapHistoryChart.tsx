'use client';

import { useMemo, useState } from 'react';
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
import { Flame, DollarSign, Calendar, ArrowRightLeft, TrendingDown, Package, ChevronDown, Activity } from 'lucide-react';

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
}

interface SwapHistoryChartProps {
  summary: HistorySummaryPoint[];
  sellIndicators: SellIndicator[];
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`bg-gray-800/40 border border-gray-700/40 rounded-xl ${className}`}>
      <button
        className="w-full flex justify-between items-center px-4 py-3 text-gray-300 hover:text-white"
        onClick={() => setOpen(!open)}
      >
        <span className="text-sm font-medium">{title}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className={`transition-all duration-300 overflow-hidden ${
          open ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4 text-gray-200 text-sm">{children}</div>
      </div>
    </div>
  );
}

export function SwapHistoryChart({
  summary,
  sellIndicators,
}: SwapHistoryChartProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // calculate total liquidation stats
  const liquidationStats = useMemo(() => {
    const totalLiquidated = sellIndicators.reduce((sum, indicator) => sum + indicator.valueUsd, 0);
    const totalSwaps = sellIndicators.length;
    
    // group by token
    const tokenStats = sellIndicators.reduce((acc, indicator) => {
      if (!acc[indicator.token]) {
        acc[indicator.token] = {
          token: indicator.token,
          totalValue: 0,
          count: 0,
        };
      }
      acc[indicator.token].totalValue += indicator.valueUsd;
      acc[indicator.token].count += 1;
      return acc;
    }, {} as Record<string, { token: string; totalValue: number; count: number }>);

    const tokensByValue = Object.values(tokenStats)
      .sort((a, b) => b.totalValue - a.totalValue);

    // calculate daily averages
    const daysWithSwaps = new Set(sellIndicators.map(indicator => 
      new Date(indicator.timestamp).toDateString()
    )).size;

    const averageDailyLiquidation = daysWithSwaps > 0 ? totalLiquidated / daysWithSwaps : 0;

    return {
      totalLiquidated,
      totalSwaps,
      tokensByValue,
      averageDailyLiquidation,
      daysWithSwaps,
    };
  }, [sellIndicators]);

  // sophisticated gray scale colors
  const getMonochromeColors = (count: number) => {
    const colorPalette = [
      'rgba(255, 255, 255, 0.9)',      // pure white
      'rgba(229, 231, 235, 0.9)',      // gray-200
      'rgba(209, 213, 219, 0.9)',      // gray-300
      'rgba(156, 163, 175, 0.9)',      // gray-400
      'rgba(107, 114, 128, 0.9)',      // gray-500
      'rgba(75, 85, 99, 0.9)',         // gray-600
      'rgba(55, 65, 81, 0.9)',         // gray-700
      'rgba(31, 41, 55, 0.9)',         // gray-800
    ];

    return colorPalette.slice(0, count);
  };

  // pie chart data for tokens
  const pieChartData = useMemo(() => {
    const topTokens = liquidationStats.tokensByValue.slice(0, 6);
    const others = liquidationStats.tokensByValue.slice(6);
    
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
  }, [liquidationStats.tokensByValue]);

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
              weight: '600',
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
            weight: '600',
          },
          bodyFont: {
            size: 12,
            weight: '500',
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

  // format date for display
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (sellIndicators.length === 0) {
    return (
      <div className="bg-black/90 border border-gray-700 rounded-xl">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-800/30 transition-colors rounded-xl"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gray-800 rounded-lg border border-gray-600">
              <Activity className="h-5 w-5 text-gray-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">liquidation analytics</h3>
              <p className="text-sm text-gray-400">no history yet</p>
            </div>
          </div>
          <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>
    );
  }

  return (
  <div className="bg-black/90 border border-gray-700 rounded-none sm:rounded-xl overflow-hidden">
    {/* dropdown header */}
    <button
      onClick={() => setIsExpanded(!isExpanded)}
      className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-800/30 transition-colors border-b border-gray-700"
    >
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-white/10 rounded-lg border border-gray-600">
          <Activity className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">liquidations</h3>
          <p className="text-sm text-gray-300">
            {liquidationStats.totalSwaps} swaps • ${liquidationStats.totalLiquidated.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-white rounded-full"></div>
          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
          <div className="w-2 h-2 bg-gray-600 rounded-full"></div>
        </div>
        <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </div>
    </button>

    {isExpanded && (
      <div className="p-4 space-y-6">
        {/* summary cards - mobile optimized */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-gray-500 transition-colors">
            <div className="flex items-center space-x-2 mb-2 sm:mb-3">
              <DollarSign className="h-4 w-4 text-white" />
              <span className="text-xs font-semibold text-gray-300 tracking-wide">total liquidated</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-green-500">
              ${liquidationStats.totalLiquidated.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-gray-500 transition-colors">
            <div className="flex items-center space-x-2 mb-2 sm:mb-3">
              <ArrowRightLeft className="h-4 w-4 text-white" />
              <span className="text-xs font-semibold text-gray-300  tracking-wide">total swaps</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-white">
              {liquidationStats.totalSwaps}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-gray-500 transition-colors">
            <div className="flex items-center space-x-2 mb-2 sm:mb-3">
              <TrendingDown className="h-4 w-4 text-white" />
              <span className="text-xs font-semibold text-gray-300  tracking-wide">avg daily</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-white">
              ${liquidationStats.averageDailyLiquidation.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-3 sm:p-4 hover:border-gray-500 transition-colors">
            <div className="flex items-center space-x-2 mb-2 sm:mb-3">
              <Calendar className="h-4 w-4 text-white" />
              <span className="text-xs font-semibold text-gray-300 tracking-wide">active days</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-white">
              {liquidationStats.daysWithSwaps}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* pie chart - mobile optimized */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-4 sm:p-6 hover:border-gray-500 transition-colors">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-white/10 rounded-lg border border-gray-600">
                <Package className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-base font-bold text-white">liquidation by token</h3>
            </div>
            <div className="h-64">
              <Pie data={pieChartData} options={pieChartOptions} />
            </div>
          </div>

          {/* recent liquidations - mobile optimized */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-4 sm:p-6 hover:border-gray-500 transition-colors">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-white/10 rounded-lg border border-gray-600">
                <Flame className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-base font-bold text-white">recent liquidations</h3>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {sellIndicators
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 8)
                .map((indicator, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 sm:p-4 bg-gray-800/50 rounded-lg border border-gray-600 hover:border-gray-400 transition-all duration-200 hover:bg-gray-700/30"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-white rounded-full"></div>
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
                      <div className="text-sm font-bold text-red-500">
                        ${indicator.valueUsd.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            {sellIndicators.length > 8 && (
              <div className="mt-3 text-center">
                <span className="text-xs font-medium text-gray-400 bg-gray-800 px-3 py-1 rounded-full border border-gray-600">
                  showing 8 of {sellIndicators.length} liquidations
                </span>
              </div>
            )}
          </div>
        </div>

        {/* token breakdown - mobile optimized */}
        {/* {liquidationStats.tokensByValue.length > 0 && (
          <div className="bg-gray-900 border border-gray-700 rounded-lg sm:rounded-xl p-4 sm:p-6 hover:border-gray-500 transition-colors">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-white/10 rounded-lg border border-gray-600">
                <TrendingDown className="h-5 w-5 text-white" />
              </div>
              <h3 className="text-base font-bold text-white">token breakdown</h3>
            </div>
            <div className="space-y-3">
              {liquidationStats.tokensByValue.map((token, index) => (
                <div
                  key={token.token}
                  className="flex items-center justify-between p-3 sm:p-4 bg-gray-800/50 rounded-lg border border-gray-600 hover:border-gray-400 transition-all duration-200 hover:bg-gray-700/30"
                >
                  <div className="flex items-center space-x-3 sm:space-x-4">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-gray-700 rounded-lg sm:rounded-xl text-sm font-bold text-white border border-gray-600">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white lowercase">
                        {token.token}
                      </div>
                      <div className="text-xs text-gray-300">
                        {token.count} swap{token.count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm sm:text-base font-bold text-red-500">
                      ${token.totalValue.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-400">
                      {((token.totalValue / liquidationStats.totalLiquidated) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )} */}
      </div>
    )}
  </div>
);
}