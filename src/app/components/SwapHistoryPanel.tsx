'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  HistorySummaryResponse,
  SwapBatchRecordWithId,
} from '../types/history';
import { SwapHistoryChart } from './SwapHistoryChart';
import {
  Clock,
  RefreshCw,
  ArrowRightLeft,
  Activity,
  AlertTriangle,
} from 'lucide-react';

const HISTORY_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_HISTORY === 'true' ||
  process.env.ENABLE_HISTORY === 'true';

export function SwapHistoryPanel() {
  const { publicKey } = useWallet();
  const [history, setHistory] = useState<SwapBatchRecordWithId[]>([]);
  const [summary, setSummary] = useState<HistorySummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    if (!publicKey || !HISTORY_ENABLED) return;

    setLoading(true);
    setError('');

    try {
      const wallet = publicKey.toBase58();
      const [historyRes, summaryRes] = await Promise.all([
        fetch(`/api/history?wallet=${wallet}&limit=10`),
        fetch(`/api/history/summary?wallet=${wallet}&range=30`),
      ]);

      if (!historyRes.ok) {
        throw new Error('history request failed');
      }
      if (!summaryRes.ok) {
        throw new Error('summary request failed');
      }

      const historyData = await historyRes.json();
      const summaryData = (await summaryRes.json()) as HistorySummaryResponse;
      setHistory(historyData.data ?? []);
      setSummary(summaryData);
    } catch (err) {
      console.error('failed to load history:', err);
      setError('unable to load swap history');
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (publicKey && HISTORY_ENABLED) {
      loadHistory();
    } else {
      setHistory([]);
      setSummary(null);
    }
  }, [publicKey, loadHistory]);

  const latestSummary = useMemo(() => {
    if (!summary || summary.points.length === 0) return null;
    const lastPoint = summary.points[summary.points.length - 1];
    const totalSold = summary.points.reduce(
      (sum, point) => sum + point.totalValue,
      0,
    );
    return {
      lastValue: lastPoint.totalValue,
      totalSold,
    };
  }, [summary]);

  if (!HISTORY_ENABLED) {
    return null;
  }

  if (!publicKey) {
    return (
      <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
        <div className="text-center text-gray-400">
          <ArrowRightLeft className="h-8 w-8 mx-auto mb-3" />
          <p className="text-sm">connect your wallet to view swap history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/40 border border-gray-700 rounded-2xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gray-800/70 rounded-lg">
            <Clock className="h-5 w-5 text-gray-300" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">swap history</h3>
            <p className="text-xs text-gray-400 lowercase">
              sells with chart indicators
            </p>
          </div>
        </div>
        <button
          onClick={loadHistory}
          disabled={loading}
          className="flex items-center space-x-2 text-xs bg-gray-800 px-3 py-2 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span>refresh</span>
        </button>
      </div>

      {error && (
        <div className="flex items-center space-x-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-4">
        <SwapHistoryChart
          summary={summary?.points ?? []}
          sellIndicators={summary?.sellIndicators ?? []}
        />
        {latestSummary && (
          <div className="flex items-center justify-between mt-4 text-sm text-gray-300">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-blue-400" />
              <span>
                latest day: $
                {latestSummary.lastValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="text-gray-400 text-xs">
              30d total sold: $
              {latestSummary.totalSold.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 max-h-72 overflow-y-auto pr-2 -mr-2">
        {history.length === 0 && !loading && (
          <div className="text-center text-gray-500 text-sm py-8">
            no swaps recorded yet
          </div>
        )}
        {history.map((record) => (
          <div
            key={record.id}
            className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-2"
          >
            <div className="flex items-center justify-between text-sm text-gray-300">
              <span>
                {new Date(record.timestamp).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  record.status === 'success'
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-yellow-500/20 text-yellow-200'
                }`}
              >
                {record.status}
              </span>
            </div>
            <div className="text-xs text-gray-400">
              {record.tokensIn.length} token
              {record.tokensIn.length !== 1 ? 's' : ''} → {record.outputToken.symbol}
            </div>
            <div className="flex items-center justify-between text-sm text-white">
              <span>
                ${record.totals.valueUsdIn.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
              {typeof record.quoteImprovementPct === 'number' && (
                <span className="text-xs text-blue-300">
                  +{record.quoteImprovementPct.toFixed(2)}% routing edge
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

