
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { TokenBalance, PriceProgress } from './types/token';
import { TokenService } from './lib/api';
import { TokenTable } from './components/TokenTable';
import { SwapInterface } from './components/SwapInterface';
import { MultisigAnalyzer } from './components/enterWallet';
import { Settings2, Wallet, Menu, X, Calculator, Search, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { collection, doc, setDoc, getDocs, query, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from './lib/firebase';
import { encryptionService } from './lib/encryption';
import { HistoricalPortfolio } from './components/ViewHistory';
import { SwapHistoryPanel } from './components/SwapHistoryPanel';

import '@solana/wallet-adapter-react-ui/styles.css';

interface PortfolioHistory {
  timestamp: Date;
  totalValue: number;
  walletCount: number;
  tokenCount: number;
}

export default function Home() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [currentView, setCurrentView] = useState<'main' | 'multisig'>('main');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [currentPortfolioData, setCurrentPortfolioData] = useState<PortfolioHistory[]>([]);
  
  const tokenService = TokenService.getInstance();

  type SafeLogData = Record<string, unknown>;

  const secureLog = {
  info: (message: string, data?: SafeLogData) => {
    if (process.env.NODE_ENV === 'development') {
    }
  },
  
  error: (message: string, error?: unknown) => {
    console.error(`[ERROR] ${message}`, error);
  },
  
  wallet: (message: string, publicKey?: string, data?: SafeLogData & { tokens?: unknown[] }) => {
    if (process.env.NODE_ENV === 'development') {
      const safeData = data ? {
        ...data,
        balances: data.balances ? '[******]' : undefined,
        values: data.values ? '[******]' : undefined,
        tokens: data.tokens ? `[${Array.isArray(data.tokens) ? data.tokens.length : '?'} tokens]` : undefined
      } : {};
    }
  }
};

const loadPortfolioHistory = useCallback(async () => {
  if (!publicKey) return;

  try {
    const anonymizedKey = encryptionService.anonymizePublicKey(publicKey.toString());
    const historyQuery = query(
      collection(db, 'wallet-history', anonymizedKey, 'records'),
      orderBy('timestamp', 'asc')
    );
    const querySnapshot = await getDocs(historyQuery);
    
    const history = querySnapshot.docs
      .map(doc => {
        const data = doc.data() as {
          encryptedData?: {
            totalValue: string;
            walletCount: string;
            tokenCount: string;
          };
          timestamp?: Timestamp;
        };
        
        if (!data.encryptedData) {
          console.warn('no encrypted data found for record:', doc.id);
          return null;
        }

        try {
          const decryptedTotalValue = encryptionService.decryptData<number>(data.encryptedData.totalValue, publicKey.toString());
          const decryptedWalletCount = encryptionService.decryptData<number>(data.encryptedData.walletCount, publicKey.toString());
          const decryptedTokenCount = encryptionService.decryptData<number>(data.encryptedData.tokenCount, publicKey.toString());

          if (decryptedTotalValue === null || decryptedWalletCount === null || decryptedTokenCount === null) {
            console.warn('failed to decrypt data for record:', doc.id);
            return null;
          }

          return {
            timestamp: data.timestamp?.toDate() || new Date(),
            totalValue: decryptedTotalValue,
            walletCount: decryptedWalletCount,
            tokenCount: decryptedTokenCount
          };
        } catch (decryptError) {
          console.error('decryption error for record:', doc.id, decryptError);
          return null;
        }
      })
      .filter(record => record !== null && record.totalValue > 0) as PortfolioHistory[];
    setCurrentPortfolioData(history);
  } catch (err) {
    console.error('failed to load encrypted wallet history:', err);
  }
}, [publicKey]);

const savePortfolioHistory = useCallback(async (totalValue: number, walletCount: number, tokenCount: number) => {
  if (!publicKey) {
    console.error('no public key - cannot save wallet history');
    return;
  }

  if (totalValue <= 0) {
    return;
  }

  try {
    const anonymizedKey = encryptionService.anonymizePublicKey(publicKey.toString());
    const encryptedData = {
      totalValue: encryptionService.encryptData(totalValue, publicKey.toString()),
      walletCount: encryptionService.encryptData(walletCount, publicKey.toString()),
      tokenCount: encryptionService.encryptData(tokenCount, publicKey.toString()),
      randomField1: encryptionService.generateRandomEncrypted(publicKey.toString()),
      randomField2: encryptionService.generateRandomEncrypted(publicKey.toString()),
    };

    const historyData = {
      timestamp: Timestamp.fromDate(new Date()),
      publicKey: publicKey.toString(),
      encryptedData: encryptedData,
      metadata: {
        hasData: true,
        recordCount: tokenCount > 0 ? 1 : 0,
        version: '1.0'
      }
    };

    const historyRef = doc(collection(db, 'wallet-history', anonymizedKey, 'records'));
    await setDoc(historyRef, historyData);
    
    setCurrentPortfolioData(prev => {
      const newHistory = [...prev, {
        timestamp: historyData.timestamp.toDate(),
        totalValue: totalValue,
        walletCount: walletCount,
        tokenCount: tokenCount
      }];
      return newHistory.slice(-100);
    });

  } catch (error) {
    console.error('failed to save encrypted wallet history:', error);
  }
}, [publicKey]);

  useEffect(() => {
    if (connected && publicKey) {
      loadPortfolioHistory();
    } else {
      setCurrentPortfolioData([]);
    }
  }, [connected, publicKey, loadPortfolioHistory]);

  const fetchTokenBalances = useCallback(async () => {
  if (!publicKey) return;
  
  setLoading(true);
  setError('');
  setProcessingProgress(0);
  setTotalToProcess(0);
  
  try {
    secureLog.wallet('fetching token balances', publicKey?.toString(), {
  tokenCount: tokens.length,
  totalValue: totalSelectedValue
});

secureLog.info('portfolio history updated', {
  recordCount: currentPortfolioData.length,
  latestTimestamp: currentPortfolioData[currentPortfolioData.length - 1]?.timestamp
});
    const tokenBalances = await tokenService.getTokenBalances(publicKey.toString());

    const tokensWithBalance = tokenBalances.filter(token => token.uiAmount > 0);
    setTotalToProcess(tokensWithBalance.length);
    
    const tokensWithPrices = await tokenService.getTokenPrices(
      tokensWithBalance,
      (progress: PriceProgress) => {
        setProcessingProgress(progress.current);
        setTotalToProcess(progress.total);
      }
    );

    setTokens(tokensWithPrices);
    
    const totalValue = tokensWithPrices.reduce((sum, token) => sum + (token.value || 0), 0);
    
    if (totalValue > 0) {
      await savePortfolioHistory(totalValue, 1, tokensWithPrices.length);
    }
    
  } catch (err) {
    setError(err instanceof Error ? err.message : 'failed to fetch tokens');
  } finally {
    setLoading(false);
  }
}, [publicKey, savePortfolioHistory]);

  const handleRefreshPrices = useCallback(async () => {
    if (!publicKey || tokens.length === 0) return;
    
    setLoading(true);
    setProcessingProgress(0);
    setError('');
    
    try {
      
      const tokensWithPositiveBalance = tokens.filter(token => token.uiAmount > 0);
      setTotalToProcess(tokensWithPositiveBalance.length);
      
      const refreshedTokens = await tokenService.getTokenPrices(
        tokensWithPositiveBalance,
        (progress: PriceProgress) => {
          setProcessingProgress(progress.current);
        }
      );
      
      const updatedTokens = tokens.map(token => {
        const refreshedToken = refreshedTokens.find(t => t.mint === token.mint);
        return refreshedToken || token;
      });
      
      setTokens(updatedTokens);
      
      const totalValue = updatedTokens.reduce((sum, token) => sum + (token.value || 0), 0);
      await savePortfolioHistory(totalValue, 1, updatedTokens.length);
      
    } catch (err) {
      console.error('error refreshing prices:', err);
      setError('failed to refresh prices');
    } finally {
      setLoading(false);
    }
  }, [publicKey, tokens, savePortfolioHistory]);

  useEffect(() => {
    if (connected) {
      fetchTokenBalances();
    } else {
      setTokens([]);
      setLoading(false);
      setProcessingProgress(0);
      setTotalToProcess(0);
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
  const [selectedOutputToken, setSelectedOutputToken] = useState<string>('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

  const handleSwapComplete = () => {
    fetchTokenBalances(); 
  };

  const handleOutputTokenChange = (mint: string) => {
    setSelectedOutputToken(mint);
  };

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
  }, [selectedTokens, totalSelectedValue]);

  useEffect(() => {
  }, [processingProgress, totalToProcess, loading]);

  const renderMainView = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 relative z-10">
      {/* Token Table */}
      <div className="lg:col-span-2 order-2 lg:order-1">
        <div className="bg-gray-800/50 rounded-xl p-4 sm:p-6 relative z-10">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 space-y-3 sm:space-y-0">
            <h2 className="text-l sm:text-xl font-semibold flex items-center space-x-2">
              <Wallet className="h-4 w-4 sm:h-5 sm:w-5 ml-3" />
              <span></span>
            </h2>
            
            <div className="flex items-center justify-between sm:justify-end space-x-2 sm:space-x-4">
              <div className="flex space-x-2">
                <button
                  onClick={() => handleSelectAll(true)}
                  className="text-s sm:text-l text-gray-400 hover:text-gray-300 transition-colors px-2 py-1"
                >
                  select all
                </button>
                <button
                  onClick={() => handleSelectAll(false)}
                  className="text-s sm:text-l text-gray-400 hover:text-gray-300 transition-colors px-2 py-1"
                >
                  clear all
                </button>
              </div>
              <button
                onClick={fetchTokenBalances}
                disabled={loading}
                className="text-xs sm:text-l bg-gray-800 hover:bg-gray-700 px-2 sm:px-3 py-1 rounded transition-colors disabled:opacity-50 whitespace-nowrap mr-2"
              >
                {loading ? (
                <div className="flex items-center space-x-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <RefreshCw className="h-4 w-4" />
                </div>
              )}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-200 text-l">
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
            onRefreshPrices={handleRefreshPrices}
            processingProgress={processingProgress}
            totalToProcess={totalToProcess}
            portfolioHistory={currentPortfolioData}
            excludeTokenMint={selectedOutputToken}
          />
        </div>
      </div>

      <div className="lg:col-span-1 order-1 lg:order-2 mb-4 sm:mb-0">
  <div className="sticky top-4">
    <SwapInterface
      selectedTokens={selectedTokens}
      totalSelectedValue={totalSelectedValue}
      allTokens={tokens}
      onSwapComplete={handleSwapComplete}
      onOutputTokenChange={handleOutputTokenChange}
    />
  </div>
</div>
    </div>
  );

  return (
  <div className="mobile-full-screen bg-gradient-to-br from-gray-1000 via-black to-black-1000 text-white relative">
    <div className="mobile-full-screen absolute inset-0 bg-gradient-to-br from-gray-1000/20 via-black to-black-1000/20 pointer-events-none" />
    <div className="relative z-10 h-full">
      {/* Mobile-optimized container */}
      <div className="mobile-container">
        <div className="mobile-content">
          <header className="flex justify-between items-center mb-6 p-4 bg-gray-1000/30 border border-gray-700/50 shadow-lg relative z-40 mobile-full-width">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Image
                    src={"/soloswap.png"}
                    alt="soloswap logo"
                    width={40}
                    height={40}
                    className="h-8 w-8 sm:h-10 sm:w-10 drop-shadow-lg"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-black-400 rounded-full opacity-20 blur-sm" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-300 via-black-300 to-gray-300 bg-clip-text text-transparent tracking-tight">
                  solo:
                </h1>
              </div>
            </div>
            
            <div className="hidden sm:flex items-center space-x-3">
              {currentView === 'main' && (
                <button
                  onClick={() => setCurrentView('multisig')}
                  className="flex items-center space-x-2 bg-gradient-to-r from-gray-800 to-black-600 hover:from-gray-500 hover:to-black-500 px-4 py-2.5 rounded-xl transition-all duration-200 text-l font-medium shadow-lg hover:shadow-gray-500/25 active:scale-95"
                >
                  <span>swap</span>
                </button>
              )}
              
              {currentView === 'multisig' && (
                <button
                  onClick={() => setCurrentView('main')}
                  className="flex items-center space-x-2 bg-gradient-to-r from-gray-800 to-black-600 hover:from-gray-500 hover:to-black-500 px-4 py-2.5 rounded-xl transition-all duration-200 text-l font-medium shadow-lg hover:shadow-gray-500/25 active:scale-95"
                >
                  <span>shop</span>
                </button>
              )}

              <div className="desktop-wallet-button">
                {isClient && (
                  <WalletMultiButton className="!bg-gradient-to-r !from-gray-800 !to-black-600 hover:!from-gray-500 hover:!to-black-500 !transition-all !duration-200 !text-sm !px-4 !py-2.5 !rounded-xl !font-medium !shadow-lg hover:!shadow-gray-500/25 active:!scale-95" />
                )}
              </div>
            </div>

            {/* Mobile buttons */}
            <div className="sm:hidden flex items-center space-x-2">
              {currentView === 'main' ? (
                <button
                  onClick={() => setCurrentView('multisig')}
                  className="flex items-center space-x-2 bg-gradient-to-r from-black-800 to-gray-800 px-3 py-2 rounded-xl text-xs font-medium active:scale-95 transition-all duration-200"
                >
                  <span>swap</span>
                </button>
              ) : (
                <button
                  onClick={() => setCurrentView('main')}
                  className="flex items-center space-x-2 bg-gradient-to-r from-black-800 to-gray-800 px-3 py-2 rounded-xl text-xs font-medium active:scale-95 transition-all duration-200"
                >
                  <span>shop</span>
                </button>
              )}

              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 bg-gray-700/50 hover:bg-gray-800/50 rounded-xl transition-all duration-200 active:scale-95 border border-gray-800"
              >
                {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </header>

          {showMobileMenu && (
            <div className="sm:hidden mb-6 p-5 bg-gray-800/50 border border-gray-700/50 shadow-lg animate-in fade-in duration-200 mobile-full-width">
              <div className="flex flex-col space-y-4">
                <div className="mobile-wallet-button flex justify-center">
                  {isClient && (
                    <WalletMultiButton className="!bg-gradient-to-r !from-gray-800 !to-black-600 hover:!from-gray-500 hover:!to-black-500 !transition-all !duration-200 !text-sm !py-3 !px-6 !rounded-xl !font-medium !w-full max-w-xs justify-center active:!scale-95" />
                  )}
                </div>
              </div>
            </div>
          )}

         <main className="mb-8 relative z-20 mobile-full-height -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="shadow-xl overflow-visible h-full"> 
            {currentView === 'main' ? renderMainView() : (
              <MultisigAnalyzer onBack={() => setCurrentView('main')} />
            )}
          </div>
        </main>


          {currentView === 'main' && (
          <div className="mb-8 relative z-20 space-y-6 -mx-4 sm:mx-0">
            <SwapHistoryPanel />
            <HistoricalPortfolio />
          </div>
          )}
          <footer className="mt-8 pt-6 border-t border-gray-700/30 relative z-20 mobile-full-width">
            <div className="flex justify-center items-center space-x-8">
              <a
                href="https://twitter.com/soloexplorerxyz"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-3 bg-gray-800/30 hover:bg-gray-700/50 rounded-xl transition-all duration-200 border border-gray-700/50 hover:border-gray-400/30 active:scale-95"
                aria-label="Follow on Twitter"
              >
                <svg 
                  className="w-5 h-5 text-gray-400 group-hover:text-blue-400 group-hover:scale-110 transition-all duration-200" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>

              <a
                href="https://github.com/ilovespectra/solo-swap-v2"
                target="_blank"
                rel="noopener noreferrer"
                className="group p-3 bg-gray-800/30 hover:bg-gray-700/50 rounded-xl transition-all duration-200 border border-gray-700/50 hover:border-gray-400/30 active:scale-95"
                aria-label="View on GitHub"
              >
                <svg 
                  className="w-5 h-5 text-gray-400 group-hover:text-gray-400 group-hover:scale-110 transition-all duration-200" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.337-3.369-1.337-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.022.8-.223 1.65-.334 2.5-.338.85.004 1.7.115 2.5.338 1.91-1.291 2.75-1.022 2.75-1.022.544 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
              </a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  </div>
);
}