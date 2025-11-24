import { useState, useMemo, useEffect } from 'react';
import { TokenBalance, PriceProgress } from '../types/token';
import { TokenService } from '../lib/api';
import { ArrowUpDown, Search, Image, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import { LoadingBar } from './LoadingBar';
import { PortfolioChart } from './HistoricalChart';

interface TokenTableProps {
  tokens: TokenBalance[];
  loading: boolean;
  onTokenSelect: (mint: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  selectedTokens: TokenBalance[];
  totalSelectedValue: number;
  onRefreshPrices?: () => void;
  processingProgress: number; 
  totalToProcess: number; 
  portfolioHistory?: Array<{
    timestamp: Date;
    totalValue: number;
    walletCount: number;
    tokenCount: number;
  }>;
  excludeTokenMint?: string;
}

type SortField = 'symbol' | 'balance' | 'USD' | 'value';
type SortDirection = 'asc' | 'desc';

interface SortIconProps {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}

const SortIcon = ({ field, sortField, sortDirection }: SortIconProps) => {
  if (sortField !== field) {
    return <ArrowUpDown className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />;
  }
  
  return sortDirection === 'asc' 
    ? <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4 text-purple-400" />
    : <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-purple-400" />;
};

interface TokenLogoProps {
  token: TokenBalance;
  size?: number;
}

const TokenLogo = ({ token, size = 8 }: TokenLogoProps) => {
  const logoClasses = size === 6 
    ? "w-6 h-6 sm:w-6 sm:h-6" 
    : "w-6 h-6 sm:w-8 sm:h-8";
  
  if (token.logoURI) {
    return (
      <img
        src={token.logoURI}
        alt={token.symbol}
        className={`rounded-full ${logoClasses} flex-shrink-0 object-cover`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  
  return (
    <div className={`bg-gradient-to-br from-purple-500 to-pink-500 rounded-full ${logoClasses} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
      {token.symbol.slice(0, 3)}
    </div>
  );
};

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

function CollapsibleSection({ title, children, defaultOpen = true, className = '' }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`bg-gray-800/50 rounded-xl backdrop-blur-sm border border-gray-700 ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 sm:p-6 text-left hover:bg-gray-700/30 transition-colors rounded-xl"
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <ChevronRight 
          className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-90' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          {children}
        </div>
      )}
    </div>
  );
}

export function TokenTable({ 
  tokens,
  loading, 
  onTokenSelect, 
  onSelectAll,
  selectedTokens, 
  totalSelectedValue,
  onRefreshPrices,
  processingProgress,
  totalToProcess,
  portfolioHistory = [],
  excludeTokenMint
}: TokenTableProps) {
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [retryLoading, setRetryLoading] = useState(false);
  const [retryProgress, setRetryProgress] = useState({ current: 0, total: 0 });
  
  const [sectionsVisible, setSectionsVisible] = useState({
    portfolioChart: true,
    portfolioSummary: true,
    searchAndFilters: true,
    tokenTable: true
  });

  const tokenService = useMemo(() => TokenService.getInstance(), []);

  useEffect(() => {}, [loading, processingProgress, totalToProcess, tokens]);

  const totalPortfolioValue = useMemo(() => {
    return tokens.reduce((total, token) => total + (token.value || 0), 0);
  }, [tokens]);

  const filteredAndSortedTokens = useMemo(() => {
    const tokensToShow = excludeTokenMint 
      ? tokens.filter(token => token.mint !== excludeTokenMint)
      : tokens;
    
    const filtered = tokensToShow.filter(token =>
      token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      let aValue: string | number = 0;
      let bValue: string | number = 0;

      switch (sortField) {
        case 'symbol':
          aValue = a.symbol.toLowerCase();
          bValue = b.symbol.toLowerCase();
          break;
        case 'balance':
          aValue = a.uiAmount;
          bValue = b.uiAmount;
          break;
        case 'USD':
          aValue = a.price || 0;
          bValue = b.price || 0;
          break;
        case 'value':
          aValue = a.value || 0;
          bValue = b.value || 0;
          break;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === 'asc' 
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    });

    return filtered;
  }, [tokens, searchTerm, sortField, sortDirection, excludeTokenMint]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const visibleTokens = excludeTokenMint 
    ? tokens.filter(token => token.mint !== excludeTokenMint)
    : tokens;
  const visibleSelectedTokens = excludeTokenMint
    ? selectedTokens.filter(token => token.mint !== excludeTokenMint)
    : selectedTokens;
  
  const allSelected = visibleTokens.length > 0 && visibleSelectedTokens.length === visibleTokens.length;
  const someSelected = visibleSelectedTokens.length > 0 && visibleSelectedTokens.length < visibleTokens.length;

  const failedTokens = useMemo(() => 
    tokens.filter(token => token.value === 0 && token.uiAmount > 0),
    [tokens]
  );

  const handleRetryFailedTokens = async () => {
    if (failedTokens.length === 0 || retryLoading) return;
    
    setRetryLoading(true);
    setRetryProgress({ current: 0, total: failedTokens.length });
    
    try {
      console.log(`retrying ${failedTokens.length} failed tokens...`);
      
      const retriedTokens = await tokenService.retryFailedTokens(
        failedTokens,
        (progress: PriceProgress) => {
          setRetryProgress({
            current: progress.current,
            total: progress.total
          });
          console.log(`retry Progress: ${progress.current}/${progress.total} - ${progress.currentToken}`);
        }
      );
      
      if (onRefreshPrices) {
        onRefreshPrices();
      }
    } catch (error) {
      console.error('failed to retry tokens:', error);
    } finally {
      setRetryLoading(false);
      setRetryProgress({ current: 0, total: 0 });
    }
  };

  const isRetryLoading = retryLoading && retryProgress.total > 0;

  if (loading || isRetryLoading) {
    const currentProgress = isRetryLoading ? retryProgress.current : processingProgress;
    const currentTotal = isRetryLoading ? retryProgress.total : totalToProcess;
    const loadingText = isRetryLoading ? 'retrying failed tokens...' : 'fetching prices from jupiter...';

    console.log('rendering loading state:', {
      currentProgress,
      currentTotal,
      progressPercentage: currentTotal > 0 ? (currentProgress / currentTotal) * 100 : 0,
      isRetryLoading
    });

    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="w-full max-w-md">
          <LoadingBar 
            totalItems={currentTotal}
            currentProcessed={currentProgress}
            itemType="tokens"
            durationPerItem={1100}
            className="mb-4"
          />
        </div>
        <div className="text-center text-gray-400 text-sm">
          {loadingText}
          {currentTotal > 0 && ` (${currentProgress}/${currentTotal})`}
          {currentTotal === 0 && ' (calculating...)'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 mobile-optimized">
      {portfolioHistory && portfolioHistory.length > 0 && (
        <CollapsibleSection 
          title="performance"
          defaultOpen={true}
        >
          <PortfolioChart 
            className="w-full"
            portfolioHistory={portfolioHistory}
            livePortfolioValue={totalPortfolioValue}
            liveTokenCount={tokens.length}
            liveWalletCount={1}
            mode="tokentable"
          />
        </CollapsibleSection>
      )}

      {/* Portfolio Summary
      <CollapsibleSection 
        title="portfolio summary"
        defaultOpen={true}
      >
        <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-xs sm:text-sm text-gray-300">total portfolio value</div>
              <div className="text-xl sm:text-2xl font-bold text-white">
                ${totalPortfolioValue.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {tokens.length} tokens • {filteredAndSortedTokens.length} visible
                {failedTokens.length > 0 && ` • ${failedTokens.length} failed`}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs sm:text-sm text-gray-300">selected value</div>
              <div className="text-lg font-semibold text-white">
                ${totalSelectedValue.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection> */}

      {/* Search and Filters */}
      <CollapsibleSection 
        title="search & filters"
        defaultOpen={true}
      >
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="search tokens..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm sm:text-base"
            />
          </div>
          
          {failedTokens.length > 0 && (
            <button
              onClick={handleRetryFailedTokens}
              disabled={retryLoading}
              className="px-4 py-3 bg-yellow-500/20 border border-yellow-500/50 rounded-lg hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium text-yellow-200"
            >
              {retryLoading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400"></div>
                  retrying...
                </div>
              ) : (
                `retry ${failedTokens.length} failed`
              )}
            </button>
          )}
        </div>

        {/* Selected Summary */}
        {selectedTokens.length > 0 && (
          <div className="bg-purple-500/20 border border-purple-500/50 rounded-lg p-3 mt-3">
            <div className="flex justify-between text-xs sm:text-sm">
              <span>selected: {selectedTokens.length} tokens</span>
              <span>total value: ${totalSelectedValue.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Failed Tokens Alert */}
        {failedTokens.length > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mt-3">
            <div className="flex justify-between items-center text-xs sm:text-sm">
              <span className="text-yellow-200">
                {failedTokens.length} tokens failed to load prices
              </span>
              <button
                onClick={handleRetryFailedTokens}
                disabled={retryLoading}
                className="text-yellow-300 hover:text-yellow-200 disabled:opacity-50 text-xs"
              >
                {retryLoading ? 'retrying...' : 'retry now'}
              </button>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* Token Table */}
      <CollapsibleSection 
        title="tokens"
        defaultOpen={true}
      >
        <div className="overflow-x-auto mobile-scroll">
          <table className="w-full min-w-[500px] sm:min-w-full token-table-mobile">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-2 sm:py-3 px-1 sm:px-2 w-10 sm:w-12">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) {
                        input.indeterminate = someSelected;
                      }
                    }}
                    onChange={(e) => onSelectAll(e.target.checked)}
                    className="rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500 w-4 h-4 sm:w-5 sm:h-5"
                  />
                </th>
                <th 
                  className="text-left py-2 sm:py-3 px-1 sm:px-2 cursor-pointer hover:bg-gray-700/50 rounded transition-colors"
                  onClick={() => handleSort('symbol')}
                >
                  <div className="flex items-center space-x-1">
                    <span className="text-xs sm:text-sm">symbol</span>
                    <SortIcon field="symbol" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th 
                  className="text-right py-2 sm:py-3 px-1 sm:px-2 cursor-pointer hover:bg-gray-700/50 rounded transition-colors"
                  onClick={() => handleSort('balance')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span className="text-xs sm:text-sm">quantity</span>
                    <SortIcon field="balance" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th 
                  className="text-right py-2 sm:py-3 px-1 sm:px-2 cursor-pointer hover:bg-gray-700/50 rounded transition-colors"
                  onClick={() => handleSort('USD')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span className="text-xs sm:text-sm">price</span>
                    <SortIcon field="USD" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
                <th 
                  className="text-right py-2 sm:py-3 px-1 sm:px-2 cursor-pointer hover:bg-gray-700/50 rounded transition-colors"
                  onClick={() => handleSort('value')}
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span className="text-xs sm:text-sm">value</span>
                    <SortIcon field="value" sortField={sortField} sortDirection={sortDirection} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedTokens.map((token) => (
                <tr 
                  key={token.mint} 
                  className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${
                    token.value === 0 && token.uiAmount > 0 ? 'opacity-60' : ''
                  }`}
                >
                  <td className="py-2 sm:py-3 px-1 sm:px-2">
                    <input
                      type="checkbox"
                      checked={token.selected}
                      onChange={(e) => onTokenSelect(token.mint, e.target.checked)}
                      className="rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500 w-4 h-4 sm:w-5 sm:h-5"
                    />
                  </td>
                  <td className="py-2 sm:py-3 px-1 sm:px-2">
                    <div className="flex items-center space-x-2 sm:space-x-3 lowercase">
                      <TokenLogo token={token} size={8} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm sm:text-base truncate">
                          {token.symbol}
                          {token.value === 0 && token.uiAmount > 0 && (
                            <span className="ml-1 text-yellow-500 text-xs"></span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{token.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right py-2 sm:py-3 px-1 sm:px-2 text-xs sm:text-sm">
                    {token.uiAmount < 0.0001 ? token.uiAmount.toExponential(2) : token.uiAmount.toFixed(4)}
                  </td>
                  <td className="text-right py-2 sm:py-3 px-1 sm:px-2 text-xs sm:text-sm">
                    {token.price ? `$${token.price < 0.01 ? token.price.toExponential(2) : token.price.toFixed(2)}` : '$0.00'}
                  </td>
                  <td className="text-right py-2 sm:py-3 px-1 sm:px-2 text-xs sm:text-sm font-medium">
                    {token.value ? `$${token.value.toFixed(2)}` : '$0.00'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredAndSortedTokens.length === 0 && (
            <div className="text-center py-6 sm:py-8 text-gray-400 text-sm sm:text-base">
              {tokens.length === 0 ? 'no tokens found' : 'no tokens match your search'}
            </div>
          )}
        </div>

        {/* Mobile Footer Info */}
        <div className="sm:hidden text-center text-xs text-gray-500 pt-2">
          scroll horizontally to view all columns
        </div>
      </CollapsibleSection>
    </div>
  );
}