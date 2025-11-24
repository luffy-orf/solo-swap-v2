'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { 
  collection, query, orderBy, getDocs, deleteDoc, doc, Timestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { encryptionService } from '../lib/encryption';
import { Trash2, Calendar, DollarSign, Wallet, Coins, Download, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';

interface PortfolioHistory {
  id: string;
  timestamp: Date;
  totalValue: number;
  walletCount: number;
  tokenCount: number;
}

interface HistoricalPortfolioProps {
  onPortfolioSelect?: (portfolio: PortfolioHistory) => void;
  currentPortfolioValue?: number;
  mode?: 'single' | 'multisig';
}

export function HistoricalPortfolio({ 
  onPortfolioSelect, 
  currentPortfolioValue, 
  mode = 'single'
}: HistoricalPortfolioProps) {
  const { publicKey } = useWallet();
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [selectedPortfolio, setSelectedPortfolio] = useState<PortfolioHistory | null>(null);

  useEffect(() => {
    if (publicKey && expanded) {
      loadPortfolioHistory();
    }
  }, [publicKey, expanded]);

  const loadPortfolioHistory = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      
      const collectionPath = mode === 'multisig' 
        ? `solo-users/${publicKey.toString()}/portfolioHistory`
        : `wallet-history/${publicKey.toString()}/records`;
      
      const historyQuery = query(
        collection(db, collectionPath),
        orderBy('timestamp', 'desc')
      );
      const querySnapshot = await getDocs(historyQuery);
      
      const history: PortfolioHistory[] = [];
      let decryptionErrors = 0;
      let successfulDecryptions = 0;

      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        
        if (!data.encryptedData) {
          console.warn('no encrypted data found for record:', doc.id);
          continue;
        }

        try {
          let decryptedData;
          
          if (mode === 'multisig') {
            decryptedData = encryptionService.decryptPortfolioHistory(
              data.encryptedData, 
              publicKey.toString()
            );
          } else {
            const decryptedTotalValue = encryptionService.decryptData<number>(
              data.encryptedData.totalValue, 
              publicKey.toString()
            );
            const decryptedWalletCount = encryptionService.decryptData<number>(
              data.encryptedData.walletCount, 
              publicKey.toString()
            );
            const decryptedTokenCount = encryptionService.decryptData<number>(
              data.encryptedData.tokenCount, 
              publicKey.toString()
            );

            if (decryptedTotalValue === null || decryptedWalletCount === null || decryptedTokenCount === null) {
              console.warn('failed to decrypt data for record:', doc.id);
              continue;
            }

            decryptedData = {
              timestamp: data.timestamp?.toDate() || new Date(),
              totalValue: decryptedTotalValue,
              walletCount: decryptedWalletCount,
              tokenCount: decryptedTokenCount
            };
          }

          if (decryptedData) {
            history.push({
              id: doc.id,
              timestamp: decryptedData.timestamp,
              totalValue: decryptedData.totalValue,
              walletCount: decryptedData.walletCount,
              tokenCount: decryptedData.tokenCount
            });
            successfulDecryptions++;
          }
        } catch (decryptError) {
          console.error('Decryption error for record:', doc.id, decryptError);
          decryptionErrors++;
        }
      }

      setPortfolioHistory(history);
      console.log(`Loaded ${mode} portfolio history:`, history.length, 'records');
      
    } catch (err) {
      console.error(`Failed to load ${mode} portfolio history:`, err);
    } finally {
      setLoading(false);
    }
  };

  // Update useEffect to reload when mode changes
  useEffect(() => {
    if (publicKey && expanded) {
      loadPortfolioHistory();
    }
  }, [publicKey, expanded, mode]);

  const deletePortfolioRecord = async (portfolioId: string) => {
    if (!publicKey) return;

    try {
      setDeletingId(portfolioId);
      await deleteDoc(doc(db, 'solo-users', publicKey.toString(), 'portfolioHistory', portfolioId));
      
      setPortfolioHistory(prev => prev.filter(record => record.id !== portfolioId));
      console.log('Deleted portfolio record:', portfolioId);
      
      if (selectedPortfolio?.id === portfolioId) {
        setSelectedPortfolio(null);
        if (onPortfolioSelect) {
          onPortfolioSelect(null as any);
        }
      }
    } catch (err) {
      console.error('Failed to delete portfolio record:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handlePortfolioSelect = (portfolio: PortfolioHistory) => {
    setSelectedPortfolio(portfolio);
    if (onPortfolioSelect) {
      onPortfolioSelect(portfolio);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const downloadHistoryAsCSV = () => {
    if (portfolioHistory.length === 0) return;

    const headers = ['Date', 'Total Value', 'Wallets', 'Tokens'];
    const csvData = portfolioHistory.map(record => [
      record.timestamp.toISOString(),
      record.totalValue.toString(),
      record.walletCount.toString(),
      record.tokenCount.toString()
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-history-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const calculateChange = (historicalValue: number) => {
    if (!currentPortfolioValue || currentPortfolioValue === 0) return 0;
    return ((currentPortfolioValue - historicalValue) / historicalValue) * 100;
  };

  if (!publicKey) {
    return (
      <div className="bg-gray-800/50 rounded-xl backdrop-blur-sm border border-gray-700 p-6 mt-6">
        <div className="text-center text-gray-400">
          <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>connect your wallet to view portfolio history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800/50 rounded-xl backdrop-blur-sm border border-gray-700 mt-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-700/30 transition-colors rounded-xl"
      >
        <div className="flex items-center space-x-3">
          <Calendar className="h-5 w-5 text-purple-400" />
          <div>
            <h3 className="text-lg font-semibold">edit history</h3>
            <p className="text-sm text-gray-400">
              {portfolioHistory.length} historical snapshot{portfolioHistory.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {portfolioHistory.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadHistoryAsCSV();
              }}
              className="flex items-center space-x-1 px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors text-xs"
            >
              <Download className="h-3 w-3" />
              <span>csv</span>
            </button>
          )}
          {expanded ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto"></div>
              <p className="text-gray-400 mt-2">loading history...</p>
            </div>
          ) : portfolioHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>no portfolio history available yet.</p>
              <p className="text-sm mt-1">analyze your wallets to generate historical data.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                  <div className="flex items-center space-x-2 mb-2">
                    <Calendar className="h-4 w-4 text-blue-400" />
                    <span className="text-sm font-medium">first record</span>
                  </div>
                  <div className="text-lg font-semibold text-blue-400 lowercase">
                    {formatDate(portfolioHistory[portfolioHistory.length - 1].timestamp)}
                  </div>
                </div>
                
                <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                  <div className="flex items-center space-x-2 mb-2">
                    <DollarSign className="h-4 w-4 text-green-400" />
                    <span className="text-sm font-medium">average value</span>
                  </div>
                  <div className="text-lg font-semibold text-green-400">
                    {formatCurrency(
                      portfolioHistory.reduce((sum, record) => sum + record.totalValue, 0) / portfolioHistory.length
                    )}
                  </div>
                </div>
                
                <div className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                  <div className="flex items-center space-x-2 mb-2">
                    <Wallet className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-medium">total snapshots</span>
                  </div>
                  <div className="text-lg font-semibold text-purple-400">
                    {portfolioHistory.length}
                  </div>
                </div>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {portfolioHistory.map((portfolio, index) => {
                  const change = calculateChange(portfolio.totalValue);
                  const isSelected = selectedPortfolio?.id === portfolio.id;
                  
                  return (
                    <div
                      key={portfolio.id}
                      className={`p-4 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-500/20 border-purple-500'
                          : 'bg-gray-700/30 border-gray-600 hover:bg-gray-700/50'
                      }`}
                      onClick={() => handlePortfolioSelect(portfolio)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 flex-1">
                          <div className="flex-shrink-0">
                            <div className={`w-3 h-3 rounded-full ${
                              isSelected ? 'bg-purple-400' : 'bg-gray-500'
                            }`} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium text-sm lowercase">
                                {formatDate(portfolio.timestamp)}
                              </span>
                              {currentPortfolioValue && (
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  change >= 0 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-4 text-xs text-gray-400">
                              <div className="flex items-center space-x-1">
                                <DollarSign className="h-3 w-3" />
                                <span>{formatCurrency(portfolio.totalValue)}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Wallet className="h-3 w-3" />
                                <span>{portfolio.walletCount} wallet{portfolio.walletCount !== 1 ? 's' : ''}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <Coins className="h-3 w-3" />
                                <span>{portfolio.tokenCount} token{portfolio.tokenCount !== 1 ? 's' : ''}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 ml-4">
                          {isSelected ? (
                            <Eye className="h-4 w-4 text-purple-400" />
                          ) : (
                            <EyeOff className="h-4 w-4 text-gray-400" />
                          )}
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePortfolioRecord(portfolio.id);
                            }}
                            disabled={deletingId === portfolio.id}
                            className="text-red-400 hover:text-red-300 transition-colors p-1 disabled:opacity-50"
                          >
                            {deletingId === portfolio.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-400"></div>
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedPortfolio && (
                <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-purple-400">selected snapshot</h4>
                    <button
                      onClick={() => {
                        setSelectedPortfolio(null);
                        if (onPortfolioSelect) {
                          onPortfolioSelect(null as any);
                        }
                      }}
                      className="text-xs text-gray-400 hover:text-gray-300"
                    >
                      clear
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400">date</div>
                      <div className="text-white lowercase">{formatDate(selectedPortfolio.timestamp)}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">total value</div>
                      <div className="text-green-400 font-semibold">
                        {formatCurrency(selectedPortfolio.totalValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">wallets & tokens</div>
                      <div className="text-white">
                        {selectedPortfolio.walletCount} wallet{selectedPortfolio.walletCount !== 1 ? 's' : ''}, {selectedPortfolio.tokenCount} token{selectedPortfolio.tokenCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}