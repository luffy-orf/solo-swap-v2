'use client';

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  ChartOptions,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { HistorySummaryPoint } from '../types/history';
import { Flame } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
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

export function SwapHistoryChart({
  summary,
  sellIndicators,
}: SwapHistoryChartProps) {
  const chartData = useMemo(() => {
    const lineData = summary.map((point) => ({
      x: point.timestamp,
      y: Number(point.totalValue.toFixed(2)),
    }));

    const sellData = sellIndicators.map((indicator) => ({
      x: indicator.timestamp,
      y: Number(indicator.valueUsd.toFixed(2)),
      token: indicator.token,
    }));

    return {
      datasets: [
        {
          label: 'liquidated value',
          data: lineData,
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 3,
          tension: 0.35,
          fill: true,
          pointRadius: 0,
          parsing: false,
        },
        {
          type: 'scatter' as const,
          label: 'sell indicator',
          data: sellData,
          backgroundColor: 'rgba(248, 113, 113, 1)',
          borderColor: 'rgba(248, 113, 113, 1)',
          pointRadius: 5,
          pointHoverRadius: 7,
          parsing: false,
        },
      ],
    };
  }, [summary, sellIndicators]);

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          borderColor: 'rgba(75, 85, 99, 0.5)',
          borderWidth: 1,
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              return new Date(items[0].parsed.x as number).toLocaleString();
            },
            label: (item) => {
              if ((item.raw as { token?: string }).token) {
                const raw = item.raw as { token?: string; y: number };
                return `${raw.token}: $${raw.y.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`;
              }
              return `$${item.parsed.y.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'day',
          },
          ticks: {
            color: 'rgb(156, 163, 175)',
          },
          grid: {
            color: 'rgba(55, 65, 81, 0.4)',
          },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: 'rgb(156, 163, 175)',
            callback: (value) =>
              `$${Number(value).toLocaleString(undefined, {
                maximumFractionDigits: 0,
              })}`,
          },
          grid: {
            color: 'rgba(55, 65, 81, 0.4)',
          },
        },
      },
    }),
    [],
  );

  if (summary.length === 0 && sellIndicators.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-500">
        <div className="p-3 bg-gray-700/40 rounded-full mb-3">
          <Flame className="h-6 w-6" />
        </div>
        <p className="text-sm">no swap history yet</p>
      </div>
    );
  }

  return (
    <div className="h-64">
      <Line data={chartData} options={options} />
    </div>
  );
}

