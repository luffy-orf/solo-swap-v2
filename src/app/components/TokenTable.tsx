'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { TokenBalance, PriceProgress } from '../types/token';
import { TokenService } from '../lib/api';
import { ArrowUpDown, Search, Image, ChevronDown, ChevronUp, ChevronRight, RefreshCw, Settings, Eye, EyeOff, GripVertical } from 'lucide-react';
import { LoadingBar } from './LoadingBar';
import { PortfolioChart } from './HistoricalChart';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, TouchSensor } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ColumnConfig, SortField } from '../types/table';
import { useColumnState } from '../hooks/useColumnState';

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
  sellIndicators?: Array<{
    timestamp: number | string
    valueUsd: number;
    token: string;
  }>; 
  excludeTokenMint?: string;
}

type SortDirection = 'asc' | 'desc';

interface SortIconProps {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}

const SortIcon = ({ field, sortField, sortDirection }: SortIconProps) => {
  if (sortField !== field) {
    return <ArrowUpDown className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500" />;
  }
  
  return sortDirection === 'asc' 
    ? <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />
    : <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />;
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
      // eslint-disable-next-line @next/next/no-img-element
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
    <div className={`bg-gradient-to-br from-purple-600 to-gray-700 rounded-full ${logoClasses} flex items-center justify-center text-white text-xs sm:text-sm font-bold flex-shrink-0`}>
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
        className="w-full flex items-center justify-between p-4 sm:p-6 text-left hover:bg-gray-700/30 transition-colors rounded-xl mobile-optimized"
      >
        <h3 className="text-m font-semibold">{title}</h3>
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

const defaultColumns: ColumnConfig[] = [
  { id: 'select', label: '', width: 60, visible: true, sortable: false, resizable: false, field: 'symbol', configurable: false },
   { id: 'value', label: 'value', width: 120, visible: true, sortable: true, resizable: true, field: 'value' },
  { id: 'symbol', label: 'symbol', width: 100, visible: true, sortable: true, resizable: true, field: 'symbol' },
  { id: 'balance', label: 'quantity', width: 100, visible: true, sortable: true, resizable: true, field: 'balance' },
  { id: 'price', label: 'price', width: 100, visible: true, sortable: true, resizable: true, field: 'USD' },
];

interface ResizableTableHeaderProps {
  column: ColumnConfig;
  onResize: (columnId: string, newWidth: number) => void;
  onSort: (field: SortField) => void;
  sortField: SortField;
  sortDirection: 'asc' | 'desc';
}

export function ResizableTableHeader({
  column,
  onResize,
  onSort,
  sortField,
  sortDirection,
}: ResizableTableHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: `${column.width}px`,
    opacity: isDragging ? 0.5 : 1,
  };

  const isResizing = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = column.width;

    const handlePointerMove = (pe: PointerEvent) => {
      if (!isResizing.current) return;
      const deltaX = pe.clientX - startXRef.current;
      const newWidth = Math.max(80, startWidthRef.current + deltaX);
      onResize(column.id, newWidth);
    };

    const handlePointerUp = () => {
      isResizing.current = false;
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleHeaderClick = () => {
    if (column.sortable) {
      onSort(column.field);
    }
  };

  return (
    <th
      key={column.id}
      style={{ width: `${column.width}px` }}
      className="relative py-3 sm:py-4 px-2 sm:px-4 bg-gray-800/50 group select-none"
                     >
      <div className="flex items-center justify-between h-full">

        <div className="flex items-center space-x-2 flex-1 h-full">
          {column.resizable && (
            <div
              {...listeners}
              className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity p-2 -m-2 rounded mobile-optimized"
              style={{ touchAction: 'none' }}
            >
              <GripVertical className="h-4 w-4 text-gray-400" />
            </div>
          )}

          <div
            onClick={handleHeaderClick}
            className={`flex-1 h-full flex items-center ${column.sortable ? 'cursor-pointer hover:text-white mobile-optimized' : ''}`}
            style={{ touchAction: column.sortable ? 'manipulation' : 'auto' }}
          >
            <div className="flex items-center space-x-2">
              <span className="text-xs sm:text-sm font-semibold text-gray-200 lowercase">
                {column.label}
              </span>
              {column.sortable && sortField === column.field && (
                <span className="text-gray-400">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              )}
            </div>
          </div>
        </div>

        {column.resizable && (
          <div
            className="absolute right-0 top-0 bottom-0 w-6 sm:w-4 cursor-col-resize hover:bg-gray-500 active:bg-gray-400 z-20 transition-colors mobile-optimized"
            onPointerDown={handlePointerDown}
            style={{ touchAction: 'none' }}
          />
        )}
      </div>
    </th>
  );
}

interface ColumnCustomizationPanelProps {
  columns: ColumnConfig[];
  onToggleVisibility: (columnId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onReset: () => void;
  isOpen: boolean;
  onClose: () => void;
}

function SortableColumnItem({ column, onToggleVisibility }: { column: ColumnConfig; onToggleVisibility: (id: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg border border-gray-600 mobile-optimized"
    >
      <div className="flex items-center space-x-3 flex-1">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-3 -m-3 rounded-lg mobile-optimized"
          style={{ touchAction: 'none' }}
        >
          <GripVertical className="h-5 w-5 text-gray-400" />
        </div>
        <span className="text-base text-gray-200 lowercase flex-1">{column.label}</span>
      </div>
      <button
        onClick={() => onToggleVisibility(column.id)}
        className="p-3 hover:bg-gray-600 rounded-lg transition-colors mobile-optimized"
        style={{ touchAction: 'manipulation', minHeight: '44px', minWidth: '44px' }}
      >
        {column.visible ? (
          <Eye className="h-5 w-5 text-green-400" />
        ) : (
          <EyeOff className="h-5 w-5 text-gray-400" />
        )}
      </button>
    </div>
  );
}

  function ColumnCustomizationPanel({
  columns,
  onToggleVisibility,
  onReorder,
  onReset,
  isOpen,
  onClose,
}: ColumnCustomizationPanelProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!active || !over) return;

    if (active.id !== over.id) {
      const oldIndex = columns.findIndex(col => col.id === active.id);
      const newIndex = columns.findIndex(col => col.id === over.id);
      reorderColumns(oldIndex, newIndex);
    }
  };
 

  if (!isOpen || !isMounted) return null;

  return (
    <div className="fixed sm:absolute top-0 sm:top-full left-0 sm:left-auto sm:right-0 mt-0 sm:mt-2 w-full sm:w-80 max-h-screen bg-gray-800 border border-gray-600 rounded-none sm:rounded-xl shadow-2xl z-50 backdrop-blur-sm overflow-hidden">
      {/* Mobile header */}
      <div className="sm:hidden p-4 border-b border-gray-700 bg-gray-800 sticky top-0">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">settings</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-2xl mobile-optimized p-3 -m-3"
            style={{ touchAction: 'manipulation', minHeight: '44px', minWidth: '44px' }}
          >
            ×
          </button>
        </div>
        <p className="text-sm text-gray-400 mt-2">drag to reorder columns, tap eye to toggle visibility</p>
      </div>

      {/* Desktop header */}
      <div className="hidden sm:block p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-m font-semibold text-white"></h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl mobile-optimized"
            style={{ touchAction: 'manipulation' }}
          >
            ×
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">drag to reorder, click eye to toggle visibility</p>
      </div>

      <div className="p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={columns.map(col => col.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3 max-h-[60vh] sm:max-h-96 overflow-y-auto">
              {columns
              .filter(col => col.configurable !== false)
              .map(column => (
                <SortableColumnItem
                  key={column.id}
                  column={column}
                  onToggleVisibility={onToggleVisibility}
                />
            ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="p-4 border-t border-gray-700 bg-gray-800 sticky bottom-0">
        <button
          onClick={onReset}
          className="w-full px-4 py-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-base font-medium transition-colors mobile-optimized"
          style={{ touchAction: 'manipulation', minHeight: '44px' }}
        >
          reset
        </button>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sortableKeyboardCoordinates = (event: any, args: any) => {
  switch (event.code) {
    case 'ArrowRight':
      return { x: args.containerRect.width, y: 0 };
    case 'ArrowLeft':
      return { x: -args.containerRect.width, y: 0 };
    default:
      return undefined;
  }
};

export function TokenTable({ 
  tokens,
  loading, 
  onTokenSelect, 
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
  const [showColumnPanel, setShowColumnPanel] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [hideZeroValueTokens, setHideZeroValueTokens] = useState(true);
  
const {
    columns,
    updateColumnWidth,
    toggleColumnVisibility,
    reorderColumns,
    resetColumns,
   } = useColumnState();

  const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 3,
    },
  }),
  useSensor(TouchSensor, {
    activationConstraint: {
      delay: 150,
      tolerance: 8,
    },
  }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  })
);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {}, [loading, processingProgress, totalToProcess, tokens]);

  const totalPortfolioValue = useMemo(() => {
    return tokens.reduce((total, token) => total + (token.value || 0), 0);
  }, [tokens]);

  const filteredAndSortedTokens = useMemo(() => {
    let tokensToShow = excludeTokenMint 
      ? tokens.filter(token => token.mint !== excludeTokenMint)
      : tokens;

    if (hideZeroValueTokens) {
      tokensToShow = tokensToShow.filter(token => !(token.value === 0 && token.uiAmount > 0));
    }

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
  }, [tokens, searchTerm, sortField, sortDirection, excludeTokenMint, hideZeroValueTokens]);

  const failedTokens = useMemo(() => 
    tokens.filter(token => token.value === 0 && token.uiAmount > 0),
    [tokens]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleRetryFailedTokens = async () => {
    if (failedTokens.length === 0 || retryLoading) return;
    
    setRetryLoading(true);
    setRetryProgress({ current: 0, total: failedTokens.length });
    
    try {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleHeaderDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = columns.findIndex(col => col.id === active.id);
      const newIndex = columns.findIndex(col => col.id === over.id);
      reorderColumns(oldIndex, newIndex);
    }
  };

  const visibleColumns = columns.filter(col => col.visible);

  const renderTableCell = (token: TokenBalance, columnId: string) => {
    switch (columnId) {
      case 'select':
        return (
          <input
            type="checkbox"
            checked={token.selected}
            onChange={(e) => onTokenSelect(token.mint, e.target.checked)}
            className="rounded-lg bg-gray-700 border-gray-600 text-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800 w-4 h-4 sm:w-5 sm:h-5 transition-all duration-200 mobile-optimized"
            style={{ touchAction: 'manipulation' }}
          />
        );
      
      case 'symbol':
        return (
          <div className="flex items-center space-x-2 sm:space-x-3 lowercase">
            <TokenLogo token={token} size={8} />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm sm:text-base text-white truncate">
                {token.symbol}
              </div>
              <div className="text-xs text-gray-400 truncate">{token.name}</div>
            </div>
          </div>
        );
      
      case 'balance':
        return (
          <div className="text-right text-xs sm:text-sm font-mono text-gray-200">
            {token.uiAmount < 0.0001 ? token.uiAmount.toExponential(2) : token.uiAmount.toFixed(4)}
          </div>
        );
      
      case 'price':
        return (
          <div className="text-right text-xs sm:text-sm font-mono text-gray-200">
            {token.price ? `$${token.price < 0.01 ? token.price.toExponential(2) : token.price.toFixed(2)}` : '- -'}
          </div>
        );
      
      case 'value':
        return (
          <div className={`text-right text-xs sm:text-sm font-mono font-semibold ${
            token.value > 0 ? 'text-green-400' : 'text-gray-400'
          }`}>
            {token.value ? `$${token.value.toFixed(2)}` : '$0.00'}
          </div>
        );
      
      default:
        return null;
    }
  };

  const isProgressComplete = totalToProcess > 0 && processingProgress >= totalToProcess;
  const shouldShowLoading = (loading || isRetryLoading) && !isProgressComplete;

  if (shouldShowLoading) {
    const currentProgress = isRetryLoading ? retryProgress.current : processingProgress;
    const currentTotal = isRetryLoading ? retryProgress.total : totalToProcess;

    return (
      <div className="mr-3 ml-3 flex flex-col items-center justify-center py-12 space-y-6">
        <div className="w-full max-w-md">
          <LoadingBar 
            totalItems={currentTotal}
            currentProcessed={currentProgress}
            itemType="tokens"
            durationPerItem={1100}
            className="mb-4"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 mobile-optimized relative z-10">
      {portfolioHistory && portfolioHistory.length > 0 && (
        <CollapsibleSection 
          title="performance"
          defaultOpen={true}
          className="bg-gray-900/30 rounded-2xl border border-gray-1000/30 shadow-xl relative z-10"
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

      <CollapsibleSection 
        title="search"
        defaultOpen={true}
        className="bg-gray-900/30 rounded-2xl border border-gray-700/30 shadow-xl relative z-10"
      >
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 sm:h-5 sm:w-5" />
            <input
              type="text"
              placeholder="search tokens by name or symbol..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="lowercase w-full pl-10 pr-4 py-3 sm:py-3.5 bg-gray-700/50 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm sm:text-base placeholder-gray-400 transition-all duration-200 mobile-optimized"
              style={{ touchAction: 'manipulation' }}
            />
          </div>
          
          {failedTokens.length > 0 && (
            <button
              onClick={handleRetryFailedTokens}
              disabled={retryLoading}
              className="px-4 py-3 sm:py-3.5 bg-gradient-to-r from-gray-600/80 to-black-600/80 border border-gray-500/50 rounded-xl hover:from-gray-600 hover:to-black-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-[1.02] active:scale-95 text-sm font-medium text-white shadow-lg hover:shadow-gray-500/25 mobile-optimized"
              style={{ touchAction: 'manipulation' }}
            >
              {retryLoading ? (
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span className="text-xs sm:text-sm">retrying...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 sm:gap-3">
                  <RefreshCw className="h-4 w-4" />
                </div>
              )}
            </button>
          )}
        </div>

        {selectedTokens.length > 0 && (
          <div className="bg-gradient-to-r from-gray-700/20 to-gray-600/20 border border-gray-500/30 rounded-xl p-4 mt-4">
            <div className="flex justify-between items-center text-sm sm:text-base">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-gradient-to-r from-gray-400 to-gray-400 rounded-full animate-pulse"></div>
                <span className="text-gray-200 font-medium">
                  {selectedTokens.length} token{selectedTokens.length !== 1 ? 's' : ''} selected
                </span>
              </div>
              <span className="text-green-500 font-bold text-lg">
                ${totalSelectedValue.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection 
        title={`tokens • ${filteredAndSortedTokens.length} of ${tokens.length}`}
        defaultOpen={true}
        className="bg-gray-900/30 rounded-2xl border border-gray-700/30 shadow-xl overflow-hidden relative z-10"
      >
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setHideZeroValueTokens(!hideZeroValueTokens)}
            className="flex items-center space-x-1 p-1 hover:bg-gray-700/50 rounded transition-colors text-gray-400 mobile-optimized"
            style={{ touchAction: 'manipulation' }}
          >
            <span>show spam</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                hideZeroValueTokens ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
        
        {isMounted ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleHeaderDragEnd}
          >
            <SortableContext 
              items={visibleColumns.map(col => col.id)} 
              strategy={horizontalListSortingStrategy}
            >
             <div className="overflow-x-auto mobile-scroll" style={{ touchAction: 'pan-x' }}>
                <table className="w-full min-w-[500px] sm:min-w-full token-table-mobile" style={{ tableLayout: 'fixed' }}>
                  <colgroup>
                    {visibleColumns.map(col => (
                      <col key={col.id} style={{ width: `${col.width}px` }} />
                    ))}
                    <col style={{ width: '48px' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-700/70 bg-gray-800/50">
                      {visibleColumns.map((column) => (
                        <ResizableTableHeader
                          key={column.id}
                          column={column}
                          onResize={updateColumnWidth}
                          onSort={handleSort}
                          sortField={sortField}
                          sortDirection={sortDirection}
                        />
                      ))}

                      <th className="py-3 sm:py-4 px-2 sm:px-4 w-12 bg-gray-800/50 relative z-20"> 
                        <div className="relative">
                          <button
                            onClick={() => setShowColumnPanel(!showColumnPanel)}
                            className="p-1 hover:bg-gray-700/50 rounded transition-colors mobile-optimized"
                            style={{ touchAction: 'manipulation' }}
                          >
                            <Settings className="h-4 w-4 text-gray-400" />
                          </button>
                        </div>
                      </th>

                    </tr>
                  </thead>

                  <tbody>
                    {filteredAndSortedTokens.map((token, index) => (
                      <tr 
                        key={token.mint} 
                        className={`border-b border-gray-700/30 hover:bg-gray-700/40 transition-all duration-200 group ${
                          token.value === 0 && token.uiAmount > 0 ? 'opacity-70' : ''
                        } ${index % 2 === 0 ? 'bg-gray-800/20' : 'bg-gray-800/10'}`}
                      >
                        {visibleColumns.map(column => (
                          <td
                            key={column.id}
                            style={{ width: `${column.width}px` }}
                            className="py-3 sm:py-4 px-2 sm:px-4"
                          >
                            {renderTableCell(token, column.id)}
                          </td>
                        ))}

                        <td className="py-3 sm:py-4 px-2 sm:px-4" />
                      </tr>
                    ))}
                  </tbody>
                </table>
               </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="overflow-x-auto mobile-scroll" style={{ touchAction: 'pan-x' }}>
            <table className="w-full min-w-[500px] sm:min-w-full token-table-mobile">
              <thead>
                <tr className="border-b border-gray-700/70 bg-gray-800/50">
                  
                  {visibleColumns.map((column) => (
                    <th
                      key={column.id}
                      style={{ width: column.width }}
                      className="relative py-3 sm:py-4 px-2 sm:px-4 bg-gray-800/50 group select-none"
                    >
                      <div className="flex items-center justify-between h-full">
                        {column.resizable && (
                          <div
                            className="absolute left-0 top-0 bottom-0 w-4 cursor-col-resize hover:bg-gray-500 active:bg-gray-400 z-10 touch-manipulation"
                          />
                        )}
                        
                        <div className="flex items-center space-x-2 flex-1 h-full">
                          {column.resizable && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <GripVertical className="h-4 w-4 text-gray-400" />
                            </div>
                          )}
                          
                          <div
                            onClick={() => column.sortable && handleSort(column.field)}
                            className={`flex-1 h-full flex items-center ${column.sortable ? 'cursor-pointer hover:text-white mobile-optimized' : ''}`}
                            style={{ touchAction: column.sortable ? 'manipulation' : 'auto' }}
                          >
                            <div className="flex items-center space-x-2">
                              <span className="text-xs sm:text-sm font-semibold text-gray-200 lowercase">
                                {column.label}
                              </span>
                              {column.sortable && sortField === column.field && (
                                <span className="text-gray-400">
                                  {sortDirection === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {column.resizable && (
                          <div
                            className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize hover:bg-purple-400 active:bg-purple-400 z-10 touch-manipulation"
                          />
                        )}
                      </div>
                    </th>
                  ))}

                  <th className="py-3 sm:py-4 px-2 sm:px-4 w-12 bg-gray-800/50 relative z-20"> 
                    <div className="relative">
                      <button
                        onClick={() => setShowColumnPanel(!showColumnPanel)}
                        className="p-1 hover:bg-gray-700/50 rounded transition-colors mobile-optimized"
                        style={{ touchAction: 'manipulation' }}
                      >
                        <Settings className="h-4 w-4 text-gray-400" />
                      </button>
                    </div>
                  </th>

                </tr>
              </thead>

              <tbody>
                {filteredAndSortedTokens.map((token, index) => (
                  <tr 
                    key={token.mint} 
                    className={`border-b border-gray-700/30 hover:bg-gray-700/40 transition-all duration-200 group ${
                      token.value === 0 && token.uiAmount > 0 ? 'opacity-70' : ''
                    } ${index % 2 === 0 ? 'bg-gray-800/20' : 'bg-gray-800/10'}`}
                  >
                    {visibleColumns.map(column => (
                      <td 
                        key={column.id}
                        style={{ width: column.width }}
                        className="py-3 sm:py-4 px-2 sm:px-4"
                      >
                        {renderTableCell(token, column.id)}
                      </td>
                    ))}
                    
                    <td className="py-3 sm:py-4 px-2 sm:px-4"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="sm:hidden text-center text-xs text-gray-500 pt-3 pb-2 border-t border-gray-700/30 mt-2">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
            <span>scroll horizontally to view all columns</span>
            <div className="w-1 h-1 bg-gray-500 rounded-full"></div>
          </div>
        </div>

      </CollapsibleSection>
    </div>
  );
}

function reorderColumns(oldIndex: number, newIndex: number) {
  throw new Error('Function not implemented.');
}
