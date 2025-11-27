import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  HistorySummaryResponse,
  SwapBatchRecord,
  SwapBatchRecordWithId,
} from '../../types/history';

const HISTORY_COLLECTION = 'swapHistory';
const MAX_LIMIT = 100;

export const recordSwapBatch = async (
  record: SwapBatchRecord,
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, HISTORY_COLLECTION), {
      ...record,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('failed to record swap batch:', error);
    throw error;
  }
};

interface HistoryQueryOptions {
  limit?: number;
  cursor?: number;
}

export const fetchHistoryByWallet = async (
  wallet: string,
  options: HistoryQueryOptions = {},
): Promise<{
  data: SwapBatchRecordWithId[];
  nextCursor?: number;
}> => {
  const pageSize = Math.min(options.limit ?? 25, MAX_LIMIT);
  try {
    const constraints = [
      where('wallet', '==', wallet),
      orderBy('timestamp', 'desc'),
      limit(pageSize),
    ];

    if (options.cursor) {
      constraints.push(startAfter(options.cursor));
    }

    const historyQuery = query(
      collection(db, HISTORY_COLLECTION),
      ...constraints,
    );

    const snapshot = await getDocs(historyQuery);
    const records: SwapBatchRecordWithId[] = snapshot.docs.map((doc) => {
      const raw = doc.data();
      const data = raw as SwapBatchRecord;
      const createdAt =
        data.timestamp ??
        (raw.createdAt instanceof Timestamp ? raw.createdAt.toMillis() : undefined);

      return {
        ...data,
        id: doc.id,
        createdAt,
      };
    });

    const nextCursor =
      snapshot.docs.length === pageSize
        ? snapshot.docs[snapshot.docs.length - 1].data().timestamp
        : undefined;

    return { data: records, nextCursor };
  } catch (error) {
    console.error('failed to fetch history:', error);
    throw error;
  }
};

export const fetchHistorySummary = async (
  wallet: string,
  days: number = 30,
): Promise<HistorySummaryResponse> => {
  try {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const historyQuery = query(
      collection(db, HISTORY_COLLECTION),
      where('wallet', '==', wallet),
      where('timestamp', '>=', since),
      orderBy('timestamp', 'desc'),
      limit(MAX_LIMIT),
    );

    const snapshot = await getDocs(historyQuery);
    const pointsMap = new Map<string, number>();
    const sellIndicators: HistorySummaryResponse['sellIndicators'] = [];

    snapshot.forEach((doc) => {
      const data = doc.data() as SwapBatchRecord;
      const dayKey = new Date(data.timestamp).toISOString().slice(0, 10);
      const existing = pointsMap.get(dayKey) ?? 0;
      pointsMap.set(dayKey, existing + (data.totals.valueUsdOut || 0));

      data.chartIndicators.forEach((indicator) => {
        sellIndicators.push({
          timestamp: indicator.timestamp,
          valueUsd: indicator.valueUsd,
          token: indicator.symbol,
        });
      });
    });

    const points = Array.from(pointsMap.entries())
      .map(([day, value]) => ({
        timestamp: new Date(`${day}T00:00:00Z`).getTime(),
        totalValue: value,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return { points, sellIndicators };
  } catch (error) {
    console.error('failed to fetch history summary:', error);
    throw error;
  }
};

