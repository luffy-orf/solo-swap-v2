import { NextResponse } from 'next/server';
import { fetchHistorySummary } from '@/app/lib/firestore/history';

const HISTORY_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_HISTORY === 'true' ||
  process.env.ENABLE_HISTORY === 'true';

export async function GET(request: Request) {
  if (!HISTORY_ENABLED) {
    return NextResponse.json({ points: [], sellIndicators: [] });
  }

  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  const rangeParam = searchParams.get('range');

  if (!wallet) {
    return NextResponse.json(
      { error: 'wallet parameter is required' },
      { status: 400 },
    );
  }

  const days = rangeParam ? Number(rangeParam) : 30;

  try {
    const summary = await fetchHistorySummary(wallet, days);
    return NextResponse.json(summary);
  } catch (error) {
    console.error('history summary error:', error);
    return NextResponse.json(
      { error: 'failed to fetch history summary' },
      { status: 500 },
    );
  }
}