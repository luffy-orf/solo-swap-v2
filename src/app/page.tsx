'use client';

import { useState, useCallback, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { TokenBalance, ProRataSwap } from './types/token';
import { TokenService } from './lib/api';
import { TokenTable } from './components/TokenTable';
import { SwapInterface } from './components/SwapInterface';
import { SettingsPanel } from './components/SettingsPannel';
import { Settings2, Wallet } from 'lucide-react';
import { RpcStatus } from './components/RpcStatus';
import Image from 'next/image';

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);

  const tokenService = new TokenService();

  const fetchTokenBalances = useCallback(async () => {
    if (!publicKey) return;
    
    setLoading(true);
    setError('');
    
    try {
      console.log('🔄 Fetching token balances for:', publicKey.toString());
      let tokenBalances = await tokenService.getTokenBalances(publicKey.toString());
      console.log('📊 Raw token balances:', tokenBalances);
      
      tokenBalances = await tokenService.getTokenPrices(tokenBalances);
      console.log('💰 Token balances with prices:', tokenBalances);
      
      setTokens(tokenBalances);
    } catch (err) {
      console.error('❌ Error fetching tokens:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens');
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  
  useEffect(() => {
    if (connected) {
      fetchTokenBalances();
    }
  }, [connected, fetchTokenBalances]);

  const handleTokenSelect = (mint: string, selected: boolean) => {
    setTokens(prev => prev.map(token => 
      token.mint === mint ? { ...token, selected } : token
    ));
  };

  const handleSelectAll = (selected: boolean) => {
    setTokens(prev => prev.map(token => ({ ...token, selected })));
  };

  const selectedTokens = tokens.filter(token => token.selected);
  const totalSelectedValue = selectedTokens.reduce((sum, token) => sum + (token.value || 0), 0);

  const handleSwapComplete = () => {
    console.log('✅ Swap completed, refreshing balances...');
    fetchTokenBalances(); // Refresh token balances after swap
  };

  // Add this inside your Home component, before the return statement
  useEffect(() => {
    const debugRpc = async () => {
      console.log('=== RPC DEBUG INFO ===');
      console.log('NEXT_PUBLIC_HELIUS_API_KEY exists:', !!process.env.NEXT_PUBLIC_HELIUS_API_KEY);
      console.log('NEXT_PUBLIC_SOLANA_RPC_URL:', process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
      
      const testService = new TokenService();
      await testService.getTokenBalances(publicKey?.toString() || 'Cj1jScR4V73qLmvWJiGiWs9jtcwCXEZsmS5cevWt9jNc');
    };

    if (connected) {
      debugRpc();
    }
  }, [connected]);

  // Debug selected tokens
  useEffect(() => {
    console.log('🎯 Selected tokens updated:', {
      count: selectedTokens.length,
      tokens: selectedTokens.map(t => ({
        symbol: t.symbol,
        selected: t.selected,
        balance: t.uiAmount,
        value: t.value
      })),
      totalValue: totalSelectedValue
    });
  }, [selectedTokens, totalSelectedValue]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-8 p-4 bg-gray-800/50 rounded-lg backdrop-blur-sm">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Image
                src={"/soloswap.png"}
                alt="SoloSwap Logo"
                width={32}
                height={32}
                className="h-8 w-auto" 
              />
              <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                solo swap
              </h1>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <RpcStatus />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Settings2 className="h-5 w-5" />
            </button>
            <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !transition-colors" />
          </div>
        </header>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Token Table */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm border border-gray-700">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold flex items-center space-x-2">
                  <Wallet className="h-5 w-5" />
                  <span>tokens</span>
                </h2>
                
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => handleSelectAll(true)}
                    className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    select all
                  </button>
                  <button
                    onClick={() => handleSelectAll(false)}
                    className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    clear all
                  </button>
                  <button
                    onClick={fetchTokenBalances}
                    disabled={loading}
                    className="text-sm bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    {loading ? 'refreshing...' : 'refresh'}
                  </button>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-200">
                  {error}
                </div>
              )}

              <TokenTable
                tokens={tokens}
                loading={loading}
                onTokenSelect={handleTokenSelect}
                onSelectAll={handleSelectAll}
                selectedTokens={selectedTokens}
                totalSelectedValue={totalSelectedValue}
              />
            </div>
          </div>

          {/* Unified Swap Interface */}
          <div className="lg:col-span-1">
            <SwapInterface
              selectedTokens={selectedTokens}
              totalSelectedValue={totalSelectedValue}
              onSwapComplete={handleSwapComplete}
            />
          </div>
        </div>

        {showSettings && (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        )}

        {/* Debug Panel */}
        <div className="mt-6 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
          <h3 className="text-sm font-medium mb-2 text-gray-400">debug</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="text-gray-400">wallet connected</div>
              <div className={connected ? 'text-green-400' : 'text-red-400'}>
                {connected ? 'yes' : 'no'}
              </div>
            </div>
            <div>
              <div className="text-gray-400">total tokens</div>
              <div>{tokens.length}</div>
            </div>
            <div>
              <div className="text-gray-400">selected tokens</div>
              <div>{selectedTokens.length}</div>
            </div>
            <div>
              <div className="text-gray-400">selected value</div>
              <div>${totalSelectedValue.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}