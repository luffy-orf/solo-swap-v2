'use client';

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { TokenBalance } from '../types/token';
import { TokenService } from '../lib/api';
import { ArrowUpDown, Calculator, AlertCircle, ExternalLink, RefreshCw, DollarSign, ShoppingCart, Shield, ChevronDown } from 'lucide-react';

interface SwapInterfaceProps {
  selectedTokens: TokenBalance[];
  totalSelectedValue: number;
  allTokens: TokenBalance[]; // All available tokens for output selection
  onSwapComplete: () => void;
  onOutputTokenChange?: (mint: string) => void; // Callback to notify parent of output token change
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
  
  const [outputToken, setOutputToken] = useState(USDC_MINT);
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const tokenSelectorRef = useRef<HTMLDivElement>(null);
  
  // Close token selector when clicking outside
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

  const signTransactionUniversal = useCallback(async (transaction: VersionedTransaction, tokenSymbol: string): Promise<VersionedTransaction> => {
    if (!signTransaction) {
      throw new Error('no signtransaction function available');
    }

    try {
      console.log(`signing ${tokenSymbol} transaction with ${isLedgerConnected ? 'ledger' : 'wallet'}...`);
      
      setCurrentStep(isLedgerConnected 
        ? `please confirm ${tokenSymbol} transaction on your ledger device...` 
        : `confirm ${tokenSymbol} swap...`
      );
      
      const signedTransaction = await signTransaction(transaction);
      
      console.log('transaction signed successfully');
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
    // Exclude the selected output token from pro-rata calculation
    const tokensToLiquidate = selectedTokens.filter(token => token.mint !== outputToken);
    
    // Recalculate total value excluding output token
    const totalValueExcludingOutput = tokensToLiquidate.reduce((sum, token) => sum + (token.value || 0), 0);
    
    return tokensToLiquidate.map(token => {
      const tokenValue = token.value || 0;
      const tokenPercentageOfTotal = totalValueExcludingOutput > 0 ? tokenValue / totalValueExcludingOutput : 0;
      
      // Use the adjusted liquidation value based on tokens excluding output token
      const adjustedLiquidationValue = (totalValueExcludingOutput * liquidationPercentage) / 100;
      const tokenLiquidationValue = adjustedLiquidationValue * tokenPercentageOfTotal;
      
      const tokenPrice = token.price || 1;
      const tokenAmountToSwap = tokenPrice > 0 ? tokenLiquidationValue / tokenPrice : 0;
      
      const finalSwapAmount = Math.min(tokenAmountToSwap, token.uiAmount);
      
      console.log(`token ${token.symbol} calculation:`, {
        tokenValue,
        tokenPercentageOfTotal: (tokenPercentageOfTotal * 100).toFixed(2) + '%',
        tokenLiquidationValue,
        tokenPrice,
        tokenAmountToSwap,
        finalSwapAmount,
        originalBalance: token.uiAmount
      });

      return {
        ...token,
        swapAmount: finalSwapAmount,
        percentage: tokenPercentageOfTotal * 100,
        liquidationAmount: tokenLiquidationValue,
        originalAmount: token.uiAmount
      };
    });
  };

  const getFreshBlockhash = async () => {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      console.log('fresh blockhash obtained:', { blockhash, lastValidBlockHeight });
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

      console.log(`getting quote for ${token.symbol}:`, {
        inputMint: token.mint,
        outputMint: outputToken,
        amount: rawAmount,
        slippageBps
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
    
    for (const token of tokens) {
      let retryCount = 0;
      const maxRetries = 2;
      let success = false;

      while (retryCount <= maxRetries && !success) {
        try {
          setCurrentStep(`swapping ${token.symbol} (${token.swapAmount.toFixed(6)})...`);
          
          console.log(`processing ${token.symbol} (attempt ${retryCount + 1}):`, {
            inputAmount: token.swapAmount,
            originalBalance: token.originalAmount,
            percentageOfBalance: ((token.swapAmount / token.originalAmount) * 100).toFixed(1) + '%',
            value: token.liquidationAmount,
            isLedgerConnected,
            walletType: wallet?.adapter?.name
          });

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

          console.log(`transaction sent with signature: ${signature}`);

          setCurrentStep(`confirming ${token.symbol} transaction...`);
          const confirmation = await connection.confirmTransaction({
            signature,
            blockhash: blockhash,
            lastValidBlockHeight: lastValidBlockHeight
          }, 'confirmed');

          if (confirmation.value.err) {
            throw new Error(`transaction failed: ${confirmation.value.err}`);
          }

          const outputTokenInfo = sortedOutputTokens.find(t => t.mint === outputToken);
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
          console.log(`successfully swapped ${token.symbol}:`, result);
          success = true;

          setSwapResults(prev => [...prev, result]);

        } catch (err) {
          retryCount++;
          
          if (retryCount > maxRetries) {
            console.error(`failed to swap ${token.symbol} after ${maxRetries} attempts:`, err);
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
            console.warn(`⚠️ retrying ${token.symbol} (attempt ${retryCount + 1})...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
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
      
      // Filter out tokens that are the same as output token and have valid amounts
      const validTokens = proRataTokens.filter(token => 
        token.mint !== outputToken && 
        token.swapAmount > 0.000001 && 
        token.liquidationAmount > 0.01
      );

      console.log(`valid tokens for liquidation:`, validTokens.map(t => ({
        symbol: t.symbol,
        swapAmount: t.swapAmount,
        liquidationAmount: t.liquidationAmount,
        percentage: ((t.swapAmount / t.originalAmount) * 100).toFixed(1) + '%',
        isLedgerConnected,
        walletType: wallet?.adapter?.name
      })));

      if (validTokens.length === 0) {
        throw new Error('no valid tokens with sufficient balance to liquidate');
      }

      const results = await executeSequentialSwaps(validTokens);

      const successfulSwaps = results.filter(result => !result.error);
      const failedSwaps = results.filter(result => result.error);

      if (successfulSwaps.length > 0) {
        const totalSwapped = successfulSwaps.reduce((sum, swap) => sum + (swap.amount || 0), 0);
        const totalSwappedPercentage = totalSelectedValue > 0 ? (totalSwapped / totalSelectedValue * 100).toFixed(1) : '0';
        
        console.log('successful liquidations:', successfulSwaps);
        
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
  
  // Get sorted tokens with USDC and SOL sticky on top
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
    
    // Sort sticky tokens: USDC first, then SOL
    stickyTokens.sort((a, b) => {
      if (a.mint === USDC_MINT) return -1;
      if (b.mint === USDC_MINT) return 1;
      if (a.mint === SOL_MINT) return -1;
      return 1;
    });
    
    // Sort other tokens alphabetically
    otherTokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    return [...stickyTokens, ...otherTokens];
  }, [allTokens]);
  
  const outputTokenInfo = sortedOutputTokens.find(t => t.mint === outputToken);
  const outputTokenSymbol = outputTokenInfo?.symbol || 'USDC';
  const hasFailedSwaps = swapResults.some(result => result.error);
  
  const handleOutputTokenChange = (mint: string) => {
    setOutputToken(mint);
    setShowTokenSelector(false);
    if (onOutputTokenChange) {
      onOutputTokenChange(mint);
    }
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4 sm:p-6 backdrop-blur-sm border border-gray-700 h-fit mobile-optimized relative z-10">
      
      <h2 className="text-lg sm:text-xl font-semibold mb-4 sm:mb-6 flex items-center space-x-2">
        <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
        <span>cart</span>
      </h2>

      <div className="max-h-[calc(100vh-200px)] overflow-y-auto mobile-scroll pr-2 -mr-2">

      {/* Wallet Status Indicator */}
      {wallet && (
        <div className={`mb-3 sm:mb-4 p-2 sm:p-3 rounded-lg border ${
          isLedgerConnected 
            ? 'bg-green-500/20 border-green-500' 
            : 'bg-blue-500/20 border-blue-500'
        }`}>
          <div className="flex items-center space-x-2 text-xs sm:text-sm font-medium lowercase">
            <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>{wallet.adapter.name} connected</span>
          </div>
          <p className="text-xs mt-1 lowercase">
            {isLedgerConnected 
              ? 'transactions will require physical confirmation on your Ledger device'
              : 'ready to sign transactions'
            }
          </p>
        </div>
      )}

      {selectedTokens.length === 0 ? (
        <div className="text-center py-6 sm:py-8 text-gray-400">
          <Calculator className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
          <p className="text-sm sm:text-base">select tokens to enable liquidation</p>
        </div>
      ) : (
        <>
          {/* Summary Section */}
          <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
            <div className="flex justify-between text-xs sm:text-sm">
              <span>selected tokens:</span>
              <span>{selectedTokens.length}</span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm">
              <span>total value:</span>
              <span>${totalSelectedValue.toFixed(2)}</span>
            </div>

            {/* Percentage Selector */}
            <div className="space-y-2 sm:space-y-3">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-300">liquidation percentage</span>
                <span className="text-purple-400 font-medium">
                  {liquidationPercentage}%
                </span>
              </div>
              
              <div className="space-y-2">
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
                          ? 'bg-purple-600 text-white' 
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
            <div className="bg-gray-700/50 rounded-lg p-3 sm:p-4 space-y-2">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-300">to liquidate</span>
                <span className="text-green-400 font-medium">
                  ${liquidationValue.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-gray-300">receive in {outputTokenSymbol}</span>
                <span className="text-blue-400 font-medium">
                  ~${liquidationValue.toFixed(2)}
                </span>
              </div>
            </div>
            
            {/* Advanced Settings Toggle */}
            <div className="border-t border-gray-600 pt-3">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center space-x-2 text-xs sm:text-sm text-gray-300 hover:text-white transition-colors w-full mobile-optimized"
              >
                <span>advanced settings</span>
                <ChevronDown className={`h-3 w-3 sm:h-4 sm:w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Advanced Settings */}
            {showAdvanced && (
              <div className="space-y-3 sm:space-y-4 animate-slideDown">
                {/* Output Token Selection */}
                <div className="relative" ref={tokenSelectorRef}>
                  <label className="block text-xs sm:text-sm font-medium mb-2">output token</label>
                  <button
                    type="button"
                    onClick={() => setShowTokenSelector(!showTokenSelector)}
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent mobile-optimized flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-2">
                      {outputTokenInfo?.logoURI ? (
                        <img src={outputTokenInfo.logoURI} alt={outputTokenSymbol} className="w-4 h-4 rounded-full" />
                      ) : (
                        <div className="w-4 h-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">
                          {outputTokenSymbol.slice(0, 2)}
                        </div>
                      )}
                      <span>{outputTokenSymbol}</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showTokenSelector ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {showTokenSelector && (
                    <div className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto mobile-scroll">
                      {sortedOutputTokens.map(token => (
                        <button
                          key={token.mint}
                          type="button"
                          onClick={() => handleOutputTokenChange(token.mint)}
                          className={`w-full px-3 py-2 text-left text-xs sm:text-sm hover:bg-gray-700 transition-colors flex items-center space-x-2 ${
                            token.mint === outputToken ? 'bg-purple-600/30' : ''
                          } ${
                            (token.mint === USDC_MINT || token.mint === SOL_MINT) ? 'border-b border-gray-600' : ''
                          }`}
                        >
                          {token.logoURI ? (
                            <img src={token.logoURI} alt={token.symbol} className="w-4 h-4 rounded-full" />
                          ) : (
                            <div className="w-4 h-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-[8px] font-bold">
                              {token.symbol.slice(0, 2)}
                            </div>
                          )}
                          <span>{token.symbol}</span>
                          {token.mint === outputToken && (
                            <span className="ml-auto text-purple-400">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Slippage Tolerance */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium mb-2">
                    slippage tolerance: {slippage}%
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.5"
                    value={slippage}
                    onChange={(e) => setSlippage(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 mobile-optimized"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>0.5%</span>
                    <span>10%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Token Breakdown */}
          <div className="mb-4 sm:mb-6">
            <h3 className="font-medium text-sm sm:text-base mb-2 sm:mb-3">liquidation breakdown</h3>
            <div className="space-y-2 max-h-32 sm:max-h-48 overflow-y-auto mobile-scroll">
              {proRataTokens.map((token) => (
                <div key={token.mint} className="flex justify-between items-center text-xs sm:text-sm bg-gray-700/30 p-2 rounded">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <div className="w-4 h-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                      {token.symbol.slice(0, 2)}
                    </div>
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
                <h4 className="font-medium text-sm sm:text-base">liquidation results</h4>
                {hasFailedSwaps && (
                  <button
                    onClick={() => {/* Add retry logic */}}
                    disabled={swapping}
                    className="text-xs bg-yellow-600 hover:bg-yellow-700 px-2 py-1 rounded flex items-center space-x-1 mobile-optimized"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span>Retry Failed</span>
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto mobile-scroll">
                {swapResults.map((result, index) => (
                  <div key={index} className="flex justify-between items-center text-xs sm:text-sm">
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
                <span className="text-xs sm:text-sm text-blue-200">{currentStep}</span>
                <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
              <div className="flex items-center space-x-2 text-red-200 mb-2">
                <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm font-medium">liquidation error</span>
              </div>
              <span className="text-xs sm:text-sm">{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={executeLiquidation}
              disabled={swapping || selectedTokens.length === 0 || !publicKey || liquidationPercentage === 0}
              className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed py-3 px-4 rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] flex items-center justify-center space-x-2 mobile-optimized text-sm sm:text-base min-h-[44px]"
            >
              {swapping ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span className="text-xs sm:text-sm">liquidating... ({swapResults.filter(r => !r.error).length}/{selectedTokens.length})</span>
                </>
              ) : (
                <>
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs sm:text-sm">liquidate {liquidationPercentage}% to {outputTokenSymbol}</span>
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