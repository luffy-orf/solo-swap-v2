import { useState, useMemo } from 'react';
import { TokenBalance } from '../types/token';
import { ArrowUpDown, Search, Image } from 'lucide-react';

interface TokenTableProps {
  tokens: TokenBalance[];
  loading: boolean;
  onTokenSelect: (mint: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  selectedTokens: TokenBalance[];
  totalSelectedValue: number;
}

type SortField = 'symbol' | 'balance' | 'USD' | 'value';
type SortDirection = 'asc' | 'desc';

// Move SortIcon component outside of the main component
interface SortIconProps {
  field: SortField;
  sortField: SortField;
}

const SortIcon = ({ field, sortField }: SortIconProps) => (
  <ArrowUpDown 
    className={`h-4 w-4 ${
      sortField === field ? 'text-purple-400' : 'text-gray-400'
    }`}
  />
);

// Move TokenLogo component outside of the main component
interface TokenLogoProps {
  token: TokenBalance;
  size?: number;
}

const TokenLogo = ({ token, size = 8 }: TokenLogoProps) => {
  if (token.logoURI) {
    return (
      <img
        src={token.logoURI}
        alt={token.symbol}
        className={`rounded-full w-${size} h-${size}`}
        onError={(e) => {
          // Fallback to placeholder if image fails to load
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }
  
  return (
    <div className={`bg-gradient-to-br from-purple-500 to-pink-500 rounded-full w-${size} h-${size} flex items-center justify-center text-white text-xs font-bold`}>
      {token.symbol.slice(0, 3)}
    </div>
  );
};

export function TokenTable({ 
  tokens, 
  loading, 
  onTokenSelect, 
  onSelectAll,
  selectedTokens, 
  totalSelectedValue 
}: TokenTableProps) {
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate total portfolio value
  const totalPortfolioValue = useMemo(() => {
    return tokens.reduce((total, token) => total + (token.value || 0), 0);
  }, [tokens]);

  const filteredAndSortedTokens = useMemo(() => {
    const filtered = tokens.filter(token =>
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
  }, [tokens, searchTerm, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const allSelected = tokens.length > 0 && selectedTokens.length === tokens.length;
  const someSelected = selectedTokens.length > 0 && selectedTokens.length < tokens.length;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Portfolio Summary */}
      <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-300">total portfolio value</div>
            <div className="text-2xl font-bold text-white">
              ${totalPortfolioValue.toFixed(2)}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {tokens.length} tokens • {filteredAndSortedTokens.length} visible
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-300">selected value</div>
            <div className="text-lg font-semibold text-white">
              ${totalSelectedValue.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <input
          type="text"
          placeholder="search tokens..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Selected Summary */}
      {selectedTokens.length > 0 && (
        <div className="bg-purple-500/20 border border-purple-500/50 rounded-lg p-3">
          <div className="flex justify-between text-sm">
            <span>selected: {selectedTokens.length} tokens</span>
            <span>total value: ${totalSelectedValue.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-2 w-12">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = someSelected;
                    }
                  }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500"
                />
              </th>
              <th 
                className="text-left py-3 px-2 cursor-pointer hover:bg-gray-700/50 rounded"
                onClick={() => handleSort('symbol')}
              >
                <div className="flex items-center space-x-1">
                  <span>Symbol</span>
                  <SortIcon field="symbol" sortField={sortField} />
                </div>
              </th>
              <th 
                className="text-right py-3 px-2 cursor-pointer hover:bg-gray-700/50 rounded"
                onClick={() => handleSort('balance')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Quantity</span>
                  <SortIcon field="balance" sortField={sortField} />
                </div>
              </th>
              <th 
                className="text-right py-3 px-2 cursor-pointer hover:bg-gray-700/50 rounded"
                onClick={() => handleSort('USD')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Price</span>
                  <SortIcon field="USD" sortField={sortField} />
                </div>
              </th>
              <th 
                className="text-right py-3 px-2 cursor-pointer hover:bg-gray-700/50 rounded"
                onClick={() => handleSort('value')}
              >
                <div className="flex items-center justify-end space-x-1">
                  <span>Value</span>
                  <SortIcon field="value" sortField={sortField} />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedTokens.map((token) => (
              <tr 
                key={token.mint} 
                className="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors"
              >
                <td className="py-3 px-2">
                  <input
                    type="checkbox"
                    checked={token.selected}
                    onChange={(e) => onTokenSelect(token.mint, e.target.checked)}
                    className="rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500"
                  />
                </td>
                <td className="py-3 px-2">
                  <div className="flex items-center space-x-3 lowercase">
                    <TokenLogo token={token} size={8} />
                    <div>
                      <div className="font-medium">{token.symbol}</div>
                      <div className="text-xs text-gray-400">{token.name}</div>
                    </div>
                  </div>
                </td>
                <td className="text-right py-3 px-2">
                  {token.uiAmount.toFixed(4)}
                </td>
                <td className="text-right py-3 px-2">
                  {token.price ? `$${token.price.toFixed(2)}` : '$0.00'}
                </td>
                <td className="text-right py-3 px-2">
                  {token.value ? `$${token.value.toFixed(2)}` : '$0.00'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredAndSortedTokens.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            {tokens.length === 0 ? 'no tokens found' : 'no tokens match your search'}
          </div>
        )}
      </div>
    </div>
  );
}