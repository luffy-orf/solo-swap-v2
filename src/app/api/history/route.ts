import { NextResponse } from 'next/server';
import { recordSwapBatch, fetchHistoryByWallet } from '@/app/lib/firestore/history';
import { SwapBatchRecord } from '@/app/types/history';

const HISTORY_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_HISTORY === 'true' ||
  process.env.ENABLE_HISTORY === 'true';

export async function GET(request: Request) {
  if (!HISTORY_ENABLED) {
    console.log('❌ History disabled - returning empty data');
    return NextResponse.json({ data: [], nextCursor: null });
  }

  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  const limitParam = searchParams.get('limit');
  const cursorParam = searchParams.get('cursor');

  console.log('🔍 History API GET called with:', { wallet, limitParam, cursorParam });

  if (!wallet) {
    console.log('❌ Missing wallet parameter');
    return NextResponse.json(
      { error: 'wallet parameter is required' },
      { status: 400 },
    );
  }

  try {
    const limit = limitParam ? Number(limitParam) : undefined;
    
    // For now, we'll remove cursor support since it requires document snapshot
    // You would need to store and retrieve the document snapshot for proper pagination
    console.log('🔄 Calling fetchHistoryByWallet...');
    const history = await fetchHistoryByWallet(wallet, { limit });
    
    console.log('✅ History fetched successfully:', {
      recordCount: history.data.length,
      hasNextCursor: !!history.nextCursor
    });
    
    // Convert the document snapshot to a serializable format if needed
    const responseData = {
      data: history.data,
      nextCursor: history.nextCursor ? 'has_more' : null // Simplified for now
    };
    
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('❌ History GET error:', error);
    
    // Return more specific error information
    return NextResponse.json(
      { 
        error: 'failed to fetch history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!HISTORY_ENABLED) {
    console.log('❌ History disabled - ignoring POST');
    return NextResponse.json({ disabled: true }, { status: 200 });
  }

  try {
    const walletHeader = request.headers.get('x-wallet');
    console.log('🔍 History API POST called with wallet header:', walletHeader);
    
    if (!walletHeader) {
      console.log('❌ Missing wallet header');
      return NextResponse.json(
        { error: 'missing wallet header' },
        { status: 401 },
      );
    }

    const payload = (await request.json()) as SwapBatchRecord | null;
    console.log('📦 Payload received:', payload ? 'valid' : 'invalid');
    
    if (!payload) {
      console.log('❌ Invalid payload');
      return NextResponse.json(
        { error: 'invalid payload' },
        { status: 400 },
      );
    }

    if (payload.wallet !== walletHeader) {
      console.log('❌ Wallet mismatch:', { payloadWallet: payload.wallet, headerWallet: walletHeader });
      return NextResponse.json(
        { error: 'wallet mismatch' },
        { status: 403 },
      );
    }

    if (!payload.tokensIn || payload.tokensIn.length === 0) {
      console.log('❌ No token data provided');
      return NextResponse.json(
        { error: 'no token data provided' },
        { status: 400 },
      );
    }

    console.log('🔄 Recording swap batch...');
    const recordId = await recordSwapBatch(payload);
    
    console.log('✅ Swap batch recorded with ID:', recordId);
    return NextResponse.json({ id: recordId }, { status: 201 });
  } catch (error) {
    console.error('❌ History POST error:', error);
    return NextResponse.json(
      { 
        error: 'failed to record swap history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 },
    );
  }
}