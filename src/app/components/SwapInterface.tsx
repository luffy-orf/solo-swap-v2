'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TokenBalance } from '../types/token';
import { TokenService } from '../lib/api';
import { ArrowUpDown, Calculator, AlertCircle, ExternalLink, RefreshCw, DollarSign, ShoppingCart, Shield, ChevronDown, Search, X } from 'lucide-react';

interface SwapInterfaceProps {
  selectedTokens: TokenBalance[];
  totalSelectedValue: number;
  allTokens: TokenBalance[];
  onSwapComplete: () => void;
  onOutputTokenChange?: (mint: string) => void;
}

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface SwapResult {
  symbol: string;
  signature?: string;
  amount: number;
  error?: string;
  inputAmount: number;
  outputAmount?: number;
  retryCount?: number;
}

interface ProRataToken extends TokenBalance {
  swapAmount: number;
  percentage: number;
  liquidationAmount: number;
  originalAmount: number;
}

interface JupiterQuoteResponse {
  outAmount: string;
  [key: string]: unknown;
}

interface JupiterSwapResponse {
  swapTransaction: string;
  [key: string]: unknown;
}

export function SwapInterface({ 
  selectedTokens, 
  totalSelectedValue,
  allTokens,
  onSwapComplete,
  onOutputTokenChange
}: SwapInterfaceProps) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction, wallet } = useWallet();

  const [isClient, setIsClient] = useState(false);
  
  const [outputToken, setOutputToken] = useState(USDC_MINT);
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const tokenSelectorRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TokenBalance[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showTokenSearch, setShowTokenSearch] = useState(false);
  const [popularTokens, setPopularTokens] = useState<TokenBalance[]>([]);

  useEffect(() => {
    fetchPopularTokens();
  }, []);

  const fetchPopularTokens = async () => {
    try {
      const response = await fetch('https://cdn.jsdelivr.net/gh/solana-labs/token-list@main/src/tokens/solana.tokenlist.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const tokens = data.tokens;
      
      const popularSymbols = ['SOL', 'USDC', 'USDT', 'BONK', 'JUP', 'RAY', 'ORCA', 'SRM', 'MSOL', 'JITO'];
      const topTokens = popularSymbols.map(symbol => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const token = tokens.find((t: any) => t.symbol === symbol);
        if (token) {
          return {
            mint: token.address,
            symbol: token.symbol,
            name: token.name,
            logoURI: token.logoURI,
            decimals: token.decimals,
            uiAmount: 0,
            value: 0,
            price: 0
          };
        }
        return null;
      }).filter(Boolean).slice(0, 10) as TokenBalance[];
      
      setPopularTokens(topTokens);
    } catch (error) {
      console.error('Failed to fetch popular tokens:', error);
      setPopularTokens([
        {
          mint: USDC_MINT,
          symbol: 'USDC',
          name: 'USD Coin',
          logoURI: '',
          decimals: 6,
          uiAmount: 0,
          value: 0,
          price: 0,
          selected: false
        },
        {
          mint: SOL_MINT,
          symbol: 'SOL',
          name: 'Solana',
          logoURI: '',
          decimals: 9,
          uiAmount: 0,
          value: 0,
          price: 0,
          selected: false
        }
      ]);
    }
  };

  useEffect(() => {
    setIsClient(true);
  }, []);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tokenSelectorRef.current && !tokenSelectorRef.current.contains(event.target as Node)) {
        setShowTokenSelector(false);
      }
    };
    
    if (showTokenSelector) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTokenSelector]);

  const [slippage, setSlippage] = useState(1.0);
  const [liquidationPercentage, setLiquidationPercentage] = useState<number>(100);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<string>('');
  const [swapResults, setSwapResults] = useState<SwapResult[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isLedgerConnected = useMemo(() => {
    return wallet?.adapter?.name?.toLowerCase().includes('ledger');
  }, [wallet]);

  const tokenService = TokenService.getInstance();

  const liquidationValue = (totalSelectedValue * liquidationPercentage) / 100;

  const sortedOutputTokens = useMemo(() => {
    const stickyTokens: TokenBalance[] = [];
    const otherTokens: TokenBalance[] = [];
    
    allTokens.forEach(token => {
      if (token.mint === USDC_MINT || token.mint === SOL_MINT) {
        stickyTokens.push(token);
      } else {
        otherTokens.push(token);
      }
    });
    
    stickyTokens.sort((a, b) => {
      if (a.mint === USDC_MINT) return -1;
      if (b.mint === USDC_MINT) return 1;
      if (a.mint === SOL_MINT) return -1;
      return 1;
    });
    
    otherTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    return [...stickyTokens, ...otherTokens];
  }, [allTokens]);

  const outputTokenInfo = useMemo(() => {
  const fromSearch = searchResults.find(t => t.mint === outputToken);
  if (fromSearch) return fromSearch;

  const fromWallet = sortedOutputTokens.find(t => t.mint === outputToken);
  if (fromWallet) return fromWallet;

  const fromPopular = popularTokens.find(t => t.mint === outputToken);
  if (fromPopular) return fromPopular;

  return sortedOutputTokens.find(t => t.mint === USDC_MINT) || popularTokens.find(t => t.mint === USDC_MINT);
}, [outputToken, sortedOutputTokens, searchResults, popularTokens]);


  const outputTokenSymbol = outputTokenInfo?.symbol || 'USDC';

  const searchTokens = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const tokens = await response.json();
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formattedResults = tokens.slice(0, 20).map((token: any) => ({
        mint: token.id,
        symbol: token.symbol,
        name: token.name,
        logoURI: token.icon,
        decimals: token.decimals,
        uiAmount: 0,
        value: 0,
        price: 0
      }));
      
      setSearchResults(formattedResults);
      
    } catch (error) {
      console.error('Token search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const signTransactionUniversal = useCallback(async (transaction: VersionedTransaction, tokenSymbol: string): Promise<VersionedTransaction> => {
    if (!signTransaction) {
      throw new Error('no signtransaction function available');
    }

    try {
      setCurrentStep(isLedgerConnected 
        ? `please confirm ${tokenSymbol} transaction on your ledger device...` 
        : `confirm ${tokenSymbol} swap...`
      );
      
      const signedTransaction = await signTransaction(transaction);
      return signedTransaction;
      
    } catch (error: unknown) {
      console.error('transaction signing failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'unknown error occurred';
      
      if (isLedgerConnected) {
        if (errorMessage.includes('denied') || errorMessage.includes('rejected')) {
          throw new Error('transaction was rejected on your ledger device.');
        } else if (errorMessage.includes('timeout')) {
          throw new Error('ledger signing timeout. please try again.');
        } else if (errorMessage.includes('disconnected') || errorMessage.includes('not found')) {
          throw new Error('ledger device not found. please ensure your device is connected and the solana app is open.');
        } else {
          throw new Error('ledger signing failed. please check your device and try again.');
        }
      } else {
        throw new Error(`transaction signing failed: ${errorMessage}`);
      }
    }
  }, [signTransaction, isLedgerConnected]);

  const calculateProRataAmounts = (): ProRataToken[] => {
    const tokensToLiquidate = selectedTokens.filter(token => token.mint !== outputToken);
    
    const totalValueExcludingOutput = tokensToLiquidate.reduce((sum, token) => sum + (token.value || 0), 0);
    
    return tokensToLiquidate.map(token => {
      const tokenValue = token.value || 0;
      const tokenPercentageOfTotal = totalValueExcludingOutput > 0 ? tokenValue / totalValueExcludingOutput : 0;
      
      const adjustedLiquidationValue = (totalValueExcludingOutput * liquidationPercentage) / 100;
      const tokenLiquidationValue = adjustedLiquidationValue * tokenPercentageOfTotal;
      
      const tokenPrice = token.price || 1;
      const tokenAmountToSwap = tokenPrice > 0 ? tokenLiquidationValue / tokenPrice : 0;
      
      const finalSwapAmount = Math.min(tokenAmountToSwap, token.uiAmount);

      return {
        ...token,
        swapAmount: finalSwapAmount,
        percentage: tokenPercentageOfTotal * 100,
        liquidationAmount: tokenLiquidationValue,
        originalAmount: token.uiAmount
      };
    });
  };

  const TokenLogo = ({ token, size = 8 }: { token?: TokenBalance; size?: number }) => {
  if (!token) {
    const logoClasses = size === 6 
      ? "w-6 h-6 sm:w-6 sm:h-6" 
      : "w-6 h-6 sm:w-8 sm:h-8";
    
    return (
      <div className={`bg-gradient-to-br from-gray-500 to-gray-600 rounded-full ${logoClasses} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
        ???
      </div>
    );
  }

  const logoClasses = size === 6 
    ? "w-6 h-6 sm:w-6 sm:h-6" 
    : "w-6 h-6 sm:w-8 sm:w-8";
  
  if (token.logoURI) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.logoURI}
        alt={token.symbol}
        className={`rounded-full ${logoClasses} flex-shrink-0 object-cover`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
        }}
      />
    );
  }
  
  return (
    <div className={`bg-gradient-to-br from-gray-500 to-gray-400 rounded-full ${logoClasses} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
      {token.symbol.slice(0, 3)}
    </div>
  );
};

  const getFreshBlockhash = async () => {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      return { blockhash, lastValidBlockHeight };
    } catch (err) {
      console.error('failed to get fresh blockhash:', err);
      throw new Error('unable to get fresh blockhash');
    }
  };

  const getSwapQuote = async (token: ProRataToken): Promise<JupiterQuoteResponse> => {
    try {
      const slippageBps = Math.floor(slippage * 100);
      const rawAmount = Math.floor(token.swapAmount * Math.pow(10, token.decimals));

      if (rawAmount <= 0) {
        throw new Error(`invalid amount for ${token.symbol}: ${rawAmount}`);
      }

      const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?` + new URLSearchParams({
        inputMint: token.mint,
        outputMint: outputToken,
        amount: rawAmount.toString(),
        slippageBps: slippageBps.toString(),
        swapMode: 'ExactIn'
      });

      const response = await fetch(quoteUrl);
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(`rate limited. please wait a moment and try again.`);
        } else if (response.status === 400) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`invalid request for ${token.symbol}: ${errorData.error || response.statusText}`);
        } else {
          throw new Error(`quote failed for ${token.symbol}: ${response.status} ${response.statusText}`);
        }
      }

      const quoteData: JupiterQuoteResponse = await response.json();
      
      if (!quoteData || !quoteData.outAmount) {
        throw new Error(`invalid quote response for ${token.symbol}`);
      }

      return quoteData;

    } catch (err) {
      console.error(`quote failed for ${token.symbol}:`, err);
      throw err;
    }
  };

  const executeSequentialSwaps = async (tokens: ProRataToken[]): Promise<SwapResult[]> => {
    const results: SwapResult[] = [];
    
    for (const [index, token] of tokens.entries()) {
      let retryCount = 0;
      const maxRetries = 3;
      let success = false;

      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      while (retryCount <= maxRetries && !success) {
        try {
          setCurrentStep(`swapping ${token.symbol} (${token.swapAmount.toFixed(6)})...`);

          if (retryCount > 0) {
            const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }

          const quoteData = await getSwapQuote(token);
          const { blockhash, lastValidBlockHeight } = await getFreshBlockhash();

          const swapResponse = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              quoteResponse: quoteData,
              userPublicKey: publicKey!.toString(),
              dynamicComputeUnitLimit: true,
              dynamicSlippage: true,
              prioritizationFeeLamports: {
                priorityLevelWithMaxLamports: {
                  maxLamports: 1000000,
                  priorityLevel: "veryHigh"
                }
              },
              wrapAndUnwrapSol: true,
              asLegacyTransaction: false,
              useSharedAccounts: true,
              configs: {
                recentBlockhash: blockhash
              }
            })
          });

          if (!swapResponse.ok) {
            const errorData = await swapResponse.json().catch(() => ({}));
            throw new Error(`swap build failed: ${errorData.error || swapResponse.statusText}`);
          }

          const swapData: JupiterSwapResponse = await swapResponse.json();

          if (!swapData.swapTransaction) {
            throw new Error('no swap transaction returned from jupiter');
          }

          const transaction = VersionedTransaction.deserialize(
            Buffer.from(swapData.swapTransaction, 'base64')
          );

          const signedTransaction = await signTransactionUniversal(transaction, token.symbol);
          
          setCurrentStep(`sending ${token.symbol} transaction...`);
          
          const signature = await connection.sendRawTransaction(
            signedTransaction.serialize(),
            {
              skipPreflight: true,
              preflightCommitment: 'confirmed',
              maxRetries: 3
            }
          );

          if (!signature) {
            throw new Error('failed to send transaction - no signature returned');
          }

          setCurrentStep(`confirming ${token.symbol} transaction...`);
          const confirmation = await connection.confirmTransaction({
            signature,
            blockhash: blockhash,
            lastValidBlockHeight: lastValidBlockHeight
          }, 'confirmed');

          if (confirmation.value.err) {
            throw new Error(`transaction failed: ${confirmation.value.err}`);
          }

          const outputDecimals = outputTokenInfo?.decimals || (outputToken === SOL_MINT ? 9 : 6);
          
          const result: SwapResult = {
            symbol: token.symbol,
            signature,
            amount: token.liquidationAmount,
            inputAmount: token.swapAmount,
            outputAmount: parseInt(quoteData.outAmount) / Math.pow(10, outputDecimals),
            retryCount
          };

          results.push(result);
          success = true;
          setSwapResults(prev => [...prev, result]);

        } catch (err) {
          retryCount++;
          
          if (retryCount > maxRetries) {
            console.error(`❌ Failed to swap ${token.symbol} after ${maxRetries} attempts:`, err);
            const errorResult: SwapResult = {
              symbol: token.symbol,
              amount: token.liquidationAmount,
              inputAmount: token.swapAmount,
              error: err instanceof Error ? err.message : 'unknown error',
              retryCount
            };
            results.push(errorResult);
            setSwapResults(prev => [...prev, errorResult]);
          } else {
          }
        }
      }
    }
    
    return results;
  };

  const executeLiquidation = async () => {
    if (!publicKey || !signTransaction || !sendTransaction || selectedTokens.length === 0) {
      setError('please connect wallet and select tokens');
      return;
    }

    if (liquidationPercentage === 0) {
      setError('please select a liquidation percentage greater than 0%');
      return;
    }

    setSwapping(true);
    setError('');
    setCurrentStep('starting liquidation...');
    setSwapResults([]);

    try {
      const proRataTokens = calculateProRataAmounts();
      
      const validTokens = proRataTokens.filter(token => 
        token.mint !== outputToken && 
        token.swapAmount > 0.000001 && 
        token.liquidationAmount > 0.01
      );

      if (validTokens.length === 0) {
        throw new Error('no valid tokens with sufficient balance to liquidate');
      }

      const results = await executeSequentialSwaps(validTokens);

      const successfulSwaps = results.filter(result => !result.error);
      const failedSwaps = results.filter(result => result.error);

      if (successfulSwaps.length > 0) {
        const totalSwapped = successfulSwaps.reduce((sum, swap) => sum + (swap.amount || 0), 0);
        const totalSwappedPercentage = totalSelectedValue > 0 ? (totalSwapped / totalSelectedValue * 100).toFixed(1) : '0';
        
        setCurrentStep(`successfully liquidated ${successfulSwaps.length} tokens (${totalSwappedPercentage}% of selection)`);
        
        setTimeout(() => setCurrentStep(''), 5000);
        onSwapComplete();
      }
      
      if (failedSwaps.length > 0) {
        const errorMsg = `${failedSwaps.length} liquidations failed. ${successfulSwaps.length > 0 ? 'partial success.' : ''}`;
        console.error('failed liquidations:', failedSwaps);
        setError(errorMsg);
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'liquidation failed';
      setError(errorMsg);
      console.error('liquidation execution error:', err);
    } finally {
      setSwapping(false);
    }
  };

  const proRataTokens = calculateProRataAmounts();
  
  const hasFailedSwaps = swapResults.some(result => result.error);

  const TokenSearchResult = ({ 
  token, 
  onSelect, 
  isSelected 
}: { 
  token: TokenBalance; 
  onSelect: (token: TokenBalance) => void;
  isSelected: boolean;
}) => {
  return (
    <button
      type="button"
      onClick={() => onSelect(token)}
      className={`w-full px-4 py-3 text-left hover:bg-gray-700/50 transition-all duration-200 flex items-center space-x-3 mobile-optimized group ${
        isSelected ? 'bg-gray-600/20 border-r-2 border-gray-500' : ''
      }`}
    >
      <TokenLogo token={token} size={8} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2 mb-1">
          <span className="font-semibold text-m text-white truncate">{token.symbol}</span>
          {isSelected && (
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          )}
        </div>
        <div className="text-xs text-gray-400 truncate">{token.name}</div>
      </div>
      <div className="flex-shrink-0">
        {isSelected ? (
          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full"></div>
          </div>
        ) : (
          <div className="w-6 h-6 border-2 border-gray-600 rounded-full group-hover:border-gray-400 transition-colors"></div>
        )}
      </div>
    </button>
  );
};

  const handleOutputTokenChange = (token: TokenBalance) => {
    setOutputToken(token.mint);
    setShowTokenSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    if (onOutputTokenChange) {
      onOutputTokenChange(token.mint);
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 sm:p-6 backdrop-blur-sm border border-gray-700 h-fit mobile-optimized relative z-10">
      
      <h2 className="text-m sm:text-l font-semibold mb-4 sm:mb-6 flex items-center space-x-2">
        <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5 ml-2" />
        <span>cart</span>
      </h2>

      <div className="max-h-[calc(100vh-200px)] overflow-y-auto mobile-scroll pr-2 -mr-2">

        {selectedTokens.length === 0 ? (
          <div className="text-center py-6 sm:py-8 text-gray-400 justify-items-center">
            <Calculator className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
            <p className="text-m sm:text-base">select tokens to enable liquidation</p>
          </div>
        ) : (
          <>
            {/* Summary Section */}
            <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
              <div className="flex justify-between text-xs sm:text-m ml-3 mr-3">
                <span>tokens selected:</span>
                <span>{selectedTokens.length}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-m ml-3 mr-3">
                <span>value:</span>
                <span>${totalSelectedValue.toFixed(2)}</span>
              </div>

              {/* Percentage Selector */}
              <div className="space-y-2 sm:space-y-3">
                <div className="flex justify-between text-xs sm:text-m ml-3 mr-3">
                  <span className="text-gray-300">percentage:</span>
                  <span className="text-gray-300 font-medium">
                    {liquidationPercentage}%
                  </span>
                </div>
                
                <div className="space-y-2 ml-2 mr-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={liquidationPercentage}
                    onChange={(e) => setLiquidationPercentage(Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider mobile-optimized"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mobile-button-group">
                    {[0, 25, 50, 75, 100].map((percent) => (
                      <button
                        key={percent}
                        onClick={() => setLiquidationPercentage(percent)}
                        className={`px-1 sm:px-2 py-1 rounded text-xs ${
                          liquidationPercentage === percent 
                            ? 'bg-gray-600 text-white' 
                            : 'hover:bg-gray-700'
                        }`}
                      >
                        {percent}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Liquidation Summary */}
              <div className="bg-gray-700/50 rounded-lg p-3 sm:p-4 space-y-2 ml-2 mr-2">
                <div className="flex justify-between text-xs sm:text-m">
                  <span className="text-gray-300">to liquidate</span>
                  <span className="text-red-500 font-medium">
                    ${liquidationValue.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xs sm:text-m">
                  <span className="text-gray-300">receive in {outputTokenSymbol}</span>
                  <span className="text-green-500 font-medium">
                    ~${liquidationValue.toFixed(2)}
                  </span>
                </div>
              </div>
              
              {/* Advanced Settings Toggle */}
              <div className="border-t border-gray-600 pt-3">
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center space-x-2 text-xs sm:text-m text-gray-300 hover:text-white transition-colors w-full mobile-optimized ml-3"
                >
                  <span>advanced settings</span>
                  <ChevronDown className={`h-3 w-3 sm:h-4 sm:w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Advanced Settings */}
              {showAdvanced && (
                <div className="space-y-3 sm:space-y-4 animate-slideDown ml-2 mr-2">
                  {/* Output Token Selection with Search */}
                  <div className="relative" ref={tokenSelectorRef}>
                    <label className="block text-xs sm:text-m font-medium mb-2">output token</label>
                    <button
                      type="button"
                      onClick={() => setShowTokenSearch(!showTokenSearch)}
                      className="w-full bg-gray-700/50 border border-gray-600 rounded-xl px-4 py-3 text-m focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent mobile-optimized flex items-center justify-between hover:bg-gray-600/50 transition-all duration-200"
                    >
                      <div className="flex items-center space-x-3">
                        <TokenLogo token={outputTokenInfo} size={6} />
                        <div className="text-left">
                          <div className="font-medium text-m text-white">{outputTokenSymbol}</div>
                          <div className="text-xs text-gray-400">click to search tokens</div>
                        </div>
                      </div>
                      <ChevronDown className={`h-4 w-4 transition-transform ${showTokenSearch ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {showTokenSearch && (
                      <div className="absolute z-50 w-full mt-2 bg-gray-800/95 backdrop-blur-xl border border-gray-600 rounded-2xl shadow-2xl max-h-80 overflow-hidden">
                        {/* Search Header */}
                        <div className="p-4 border-b border-gray-700">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                            <input
                              type="text"
                              placeholder="search for any token on solana..."
                              value={searchQuery}
                              onChange={(e) => {
                                setSearchQuery(e.target.value);
                                searchTokens(e.target.value);
                              }}
                              className="w-full pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-transparent text-m placeholder-gray-400"
                            />
                            {searchQuery && (
                              <button
                                onClick={() => {
                                  setSearchQuery('');
                                  setSearchResults([]);
                                }}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2"
                              >
                                <X className="h-4 w-4 text-gray-400 hover:text-white" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="max-h-60 overflow-y-auto mobile-scroll">
                          {/* Popular Tokens */}
                          {!searchQuery && (
                            <div className="p-2">
                              <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                Popular Tokens
                              </div>
                              {popularTokens.map(token => (
                                <TokenSearchResult 
                                  key={token.mint} 
                                  token={token} 
                                  onSelect={handleOutputTokenChange}
                                  isSelected={token.mint === outputToken}
                                />
                              ))}
                            </div>
                          )}

                          {/* Search Results */}
                          {searchQuery && (
                            <div className="p-2">
                              <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                search results
                              </div>
                              {isSearching ? (
                                <div className="flex justify-center items-center py-8">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-500"></div>
                                  <span className="ml-2 text-m text-gray-400">searching...</span>
                                </div>
                              ) : searchResults.length > 0 ? (
                                searchResults.map(token => (
                                  <TokenSearchResult 
                                    key={token.mint} 
                                    token={token} 
                                    onSelect={handleOutputTokenChange}
                                    isSelected={token.mint === outputToken}
                                  />
                                ))
                              ) : (
                                <div className="text-center py-8 text-gray-400 text-m">
                                  no tokens found matching {searchQuery}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Wallet Tokens */}
                          {!searchQuery && sortedOutputTokens.length > 0 && (
                            <div className="p-2 border-t border-gray-700">
                              <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                your Tokens
                              </div>
                              {sortedOutputTokens.map(token => (
                                <TokenSearchResult 
                                  key={token.mint} 
                                  token={token} 
                                  onSelect={handleOutputTokenChange}
                                  isSelected={token.mint === outputToken}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Slippage Tolerance */}
                  <div>
                    <label className="block text-xs sm:text-m font-medium mb-2">
                      slippage tolerance: {slippage}%
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.1"
                      value={slippage}
                      onChange={(e) => setSlippage(parseFloat(e.target.value))}
                      className="w-full accent-gray-500 mobile-optimized"
                    />
                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                      <span>0.5%</span>
                      <span>5%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Token Breakdown */}
            <div className="mb-4 sm:mb-6 ml-3 mr-3">
              <h3 className="font-medium text-m sm:text-base mb-2 sm:mb-3">liquidation breakdown</h3>
              <div className="space-y-2 max-h-32 sm:max-h-48 overflow-y-auto mobile-scroll">
                {proRataTokens
                  .sort((a, b) => b.liquidationAmount - a.liquidationAmount)
                  .map((token) => (
                    <div key={token.mint} className="flex justify-between items-center text-xs sm:text-m bg-gray-700/30 p-2 rounded">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <TokenLogo token={token} size={6} />
                        <span className="truncate">{token.symbol}</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-green-400">
                          {token.swapAmount > 0.0001 ? token.swapAmount.toFixed(4) : token.swapAmount.toFixed(6)}
                        </div>
                        <div className="text-gray-400 text-xs">
                          ${token.liquidationAmount.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
           
            {/* Swap Results */}
            {swapResults.length > 0 && (
              <div className="mb-4 p-3 bg-gray-700/50 border border-gray-600 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-m sm:text-base">liquidation results</h4>
                  {hasFailedSwaps && (
                    <button
                      onClick={() => {/* Add retry logic */}}
                      disabled={swapping}
                      className="text-xs bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded flex items-center space-x-1 mobile-optimized"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>failed</span>
                    </button>
                  )}
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto mobile-scroll">
                  {swapResults.map((result, index) => (
                    <div key={index} className="flex justify-between items-center text-xs sm:text-m">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <span className={`truncate ${result.error ? 'text-red-400' : 'text-green-400'}`}>
                          {result.symbol}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {result.error ? (
                          <span className="text-red-400 text-xs">failed</span>
                        ) : result.signature ? (
                          <div className="flex flex-col items-end">
                            <a 
                              href={`https://solscan.io/tx/${result.signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-400 hover:text-green-300 text-xs flex items-center space-x-1 mobile-optimized"
                            >
                              <span>success</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <div className="text-gray-400 text-xs">
                              {result.inputAmount > 0.0001 ? result.inputAmount.toFixed(4) : result.inputAmount.toFixed(6)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-yellow-400 text-xs">pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current Step Indicator */}
            {swapping && currentStep && (
              <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-m text-blue-200">{currentStep}</span>
                  <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
                <div className="flex items-center space-x-2 text-red-200 mb-2">
                  <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span className="text-xs sm:text-m font-medium">liquidation error</span>
                </div>
                <span className="text-xs sm:text-m">{error}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3 ml-2 mr-2">
              <button
                onClick={executeLiquidation}
                disabled={swapping || selectedTokens.length === 0 || !publicKey || liquidationPercentage === 0}
                className="w-full bg-gradient-to-r from-gray-600 to-gray-600 hover:from-gray-500 hover:to-gray-400 disabled:opacity-50 disabled:cursor-not-allowed py-3 px-4 rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] flex items-center justify-center space-x-2 mobile-optimized text-m sm:text-base min-h-[44px]"
              >
                {swapping ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span className="text-xs sm:text-m">liquidating... ({swapResults.filter(r => !r.error).length}/{selectedTokens.length})</span>
                  </>
                ) : (
                  <>
                    <DollarSign className="h-4 w-4" />
                    <span className="text-xs sm:text-m">liquidate {liquidationPercentage}% to {outputTokenSymbol}</span>
                    {isLedgerConnected && <Shield className="h-4 w-4 ml-1" />}
                  </>
                )}
              </button>
            </div>

            {!publicKey && (
              <div className="mt-3 p-2 bg-yellow-500/20 border border-yellow-500 rounded-lg">
                <p className="text-xs text-yellow-200 text-center">
                  connect your wallet to enable liquidation
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}