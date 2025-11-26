'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { TokenBalance } from '../types/token';
import { TokenService } from '../lib/api';
import { 
  Search, ExternalLink, Calculator, Copy, CheckCircle, AlertCircle, 
  Wallet, Download, ArrowUpDown, ChevronUp, ChevronDown, HelpCircle,
  Plus, Trash2, Upload, FileText, Clock, ChevronRight
} from 'lucide-react';
import { 
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, 
  query, orderBy, Timestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import Papa from 'papaparse';
import { PortfolioChart } from './HistoricalChart';
import { encryptionService } from '../lib/encryption';
import { HistoricalPortfolio } from './ViewHistory';

declare global {
  interface Window {
    refreshPortfolioChart?: () => void;
  }
}

interface MultisigAnalyzerProps {
  onBack: () => void;
}

interface AnalysisResult {
  tokens: TokenBalance[];
  totalValue: number;
  walletAddress: string;
  nickname?: string;
  isDomain: boolean;
  analyzedAt: Date;
}

interface SavedWallet {
  id: string;
  address: string;
  nickname?: string | null;
  createdAt: Date;
  isDomain: boolean;
  lastAnalyzed?: Date | null;
  lastTotalValue?: number;
}

interface ExtendedTokenBalance extends TokenBalance {
  sourceWallet: string;
  sourceNickname: string;
}

interface PortfolioHistory {
  timestamp: Date;
  totalValue: number;
  walletCount: number;
  tokenCount: number;
}

type SortField = 'symbol' | 'balance' | 'value' | 'percentage';
type SortDirection = 'asc' | 'desc';

interface SortIconProps {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
}

const SortIcon = ({ field, sortField, sortDirection }: SortIconProps) => {
  if (sortField !== field) {
    return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
  }
  
  return sortDirection === 'asc' 
    ? <ChevronUp className="h-3 w-3 text-gray-400" />
    : <ChevronDown className="h-3 w-3 text-gray-400" />;
};

interface LoadingBarProps {
  totalItems: number;
  currentProcessed: number;
  itemType?: string;
  durationPerItem?: number;
  className?: string;
}

export function LoadingBar({ 
  totalItems, 
  currentProcessed, 
  itemType = 'tokens',
  durationPerItem = 1100,
  className = '' 
}: LoadingBarProps) {
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previousProcessedRef = useRef<number>(0);

  useEffect(() => {
    if (totalItems === 0) return;

    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    const updateProgress = () => {
      if (!startTimeRef.current) return;

      const currentTime = Date.now();
      const elapsed = currentTime - startTimeRef.current;
      const totalDuration = totalItems * durationPerItem;
      
      const actualProgress = totalItems > 0 ? (currentProcessed / totalItems) * 100 : 0;
      const timeBasedProgress = totalDuration > 0 ? Math.min((elapsed / totalDuration) * 100, 100) : 0;
      
      const displayProgress = Math.max(actualProgress, timeBasedProgress);
      setProgress(Math.min(displayProgress, 100));

      if (actualProgress > 0 && actualProgress < 100) {
        const estimatedTotalTime = (elapsed / actualProgress) * 100;
        const remaining = estimatedTotalTime - elapsed;
        setTimeRemaining(Math.max(0, remaining));
      } else if (timeBasedProgress > 0 && timeBasedProgress < 100) {
        const remaining = totalDuration - elapsed;
        setTimeRemaining(Math.max(0, remaining));
      } else {
        setTimeRemaining(0);
      }

      if (displayProgress < 100) {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      } else {
        setProgress(100);
        setTimeRemaining(0);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [totalItems, currentProcessed, durationPerItem]);

  useEffect(() => {
    
    startTimeRef.current = Date.now();
    previousProcessedRef.current = 0;
    const resetFrame = requestAnimationFrame(() => {
      setProgress(0);
      setTimeRemaining(0);
    });

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    return () => cancelAnimationFrame(resetFrame);
  }, [totalItems]);

  useEffect(() => {
    if (currentProcessed > previousProcessedRef.current) {
      previousProcessedRef.current = currentProcessed;
    }

    if (totalItems > 0 && currentProcessed >= totalItems) {
      const timer = setTimeout(() => {
        setProgress(100);
        setTimeRemaining(0);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [currentProcessed, totalItems]);

  const formatTimeRemaining = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const itemsRemaining = totalItems - currentProcessed;
  const isComplete = progress >= 100 || (totalItems > 0 && currentProcessed >= totalItems);

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-gray-300 font-medium">
          {totalItems} {itemType} detected
        </span>
        <span className="text-sm text-gray-400">
          {isComplete ? 'complete!' : timeRemaining > 0 ? `${formatTimeRemaining(timeRemaining)} remaining` : 'starting...'}
        </span>
      </div>

      <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-gray-500 to-gray-300 rounded-full transition-all duration-300 ease-out relative"
          style={{ width: `${progress}%` }}
        >
          {!isComplete && (
            <div 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
              style={{
                animation: 'shimmer 2s infinite'
              }}
            />
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mt-2">
        <span className="text-xs text-gray-400">
          {Math.round(progress)}% complete
        </span>
      </div>

      {itemsRemaining > 0 && !isComplete && (
        <div className="flex items-center justify-center mt-3 space-x-2">
          <div className="flex space-x-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-gray-300 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {isComplete && (
        <div className="flex items-center justify-center mt-3 space-x-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-ping" />
        </div>
      )}

      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

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
        className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-700/30 transition-colors rounded-xl"
      >
        <h3 className="text-lg font-semibold">{title}</h3>
        <ChevronRight 
          className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-90' : ''
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-6 pb-6">
          {children}
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MultisigAnalyzer({ onBack }: MultisigAnalyzerProps) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const tokenService = useMemo(() => TokenService.getInstance(), []);
  const [walletInput, setWalletInput] = useState('');
  const [walletNickname, setWalletNickname] = useState<string>(''); 
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>([]);
  const [copied, setCopied] = useState(false);
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [liquidationAmount, setLiquidationAmount] = useState<string>('');
  const [liquidationType, setLiquidationType] = useState<'dollar' | 'percentage'>('percentage');
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [csvUploadError, setCsvUploadError] = useState('');
  const [addingWallet, setAddingWallet] = useState(false);
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioHistory[]>([]);
  const [lastLoadedPortfolioValue, setLastLoadedPortfolioValue] = useState<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loadingLastValue, setLoadingLastValue] = useState<boolean>(false);
  const [chartDataLoaded, setChartDataLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [targetToken, setTargetToken] = useState<any>(null);

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

  const [loadingProgress, setLoadingProgress] = useState({
    totalItems: 0,
    currentProcessed: 0,
    itemType: 'wallets' as const,
    isActive: false
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const SNS_DOMAINS = ['.sol', '.bonk', '.poor', '.ser', '.abc', '.backpack', '.crown', '.gogo', '.hodl', '.meme', '.monke', '.oon', '.ponke', '.pump', '.shark', '.snipe', '.turtle', '.wallet', '.whale', '.worker', '.00', '.inv', '.ux', '.ray', '.luv'];

  const [sectionsVisible, setSectionsVisible] = useState({
    help: true,
    lastPortfolio: true,
    manageWallets: true,
    portfolioChart: true,
    portfolioAnalysis: true,
    liquidation: true,
    shoppingList: true,
    tokenTable: true,
    portfolioSummary: true
  });

  const toggleSection = (section: keyof typeof sectionsVisible) => {
    setSectionsVisible(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  useEffect(() => {
    if (!publicKey) return;

    const loadPortfolioHistory = async () => {
      try {
        const anonymizedKey = encryptionService.anonymizePublicKey(publicKey.toString());
        const historyQuery = query(
          collection(db, 'solo-users', anonymizedKey, 'portfolioHistory'),
          orderBy('timestamp', 'asc')
        );
        const querySnapshot = await getDocs(historyQuery);
        
        const history: PortfolioHistory[] = [];
        let decryptionErrors = 0;
        let successfulDecryptions = 0;

        for (const doc of querySnapshot.docs) {
          const data = doc.data();
          
          if (!data.encryptedData) {
            console.warn('No encrypted data found for record:', doc.id);
            continue;
          }

          try {
            const decryptedData = encryptionService.decryptPortfolioHistory(
              data.encryptedData, 
              publicKey.toString()
            );

            if (decryptedData) {
              history.push({
                timestamp: decryptedData.timestamp,
                totalValue: decryptedData.totalValue,
                walletCount: decryptedData.walletCount,
                tokenCount: decryptedData.tokenCount
              });
              successfulDecryptions++;
            } else {
              console.warn('failed to decrypt data for record:', doc.id);
              decryptionErrors++;
            }
          } catch (decryptError) {
            console.error('decryption error for record:', doc.id, decryptError);
            decryptionErrors++;
          }
        }

        history.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        setPortfolioHistory(history);
        setChartDataLoaded(true);

        if (decryptionErrors > 0) {
          console.warn(`${decryptionErrors} records could not be decrypted and were skipped`);
        }

      } catch (err) {
        console.error('failed to load encrypted multi-wallet portfolio history:', err);
        setChartDataLoaded(true);
      }
    };

    loadPortfolioHistory();
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey) return;

    const loadSavedWallets = async () => {
      try {
        setLoadingLastValue(true);
        const walletsQuery = query(collection(db, 'solo-users', publicKey.toString(), 'wallets'));
        const querySnapshot = await getDocs(walletsQuery);
        
        const wallets = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate() || new Date(0),
            lastAnalyzed: data.lastAnalyzed?.toDate() || undefined,
            lastTotalValue: data.lastTotalValue || 0 
          };
        }) as SavedWallet[];
        
        wallets.sort((a, b) => {
          const timeA = a.createdAt?.getTime() || 0;
          const timeB = b.createdAt?.getTime() || 0;
          return timeB - timeA;
        });
        
        setSavedWallets(wallets);
        
        const totalLastValue = wallets.reduce((sum, wallet) => sum + (wallet.lastTotalValue || 0), 0);
        setLastLoadedPortfolioValue(totalLastValue);
        
      } catch (err) {
        console.error('failed to load saved wallets:', err);
      } finally {
        setLoadingLastValue(false); 
      }
    };

    loadSavedWallets();
  }, [publicKey]);

  const saveWalletToFirestore = async (address: string, nickname?: string, isDomain: boolean = false) => {
    if (!publicKey) {
      throw new Error('wallet not connected. please ensure your wallet is connected and try again.');
    }

    if (!address) throw new Error('wallet address is required');

    const walletData = {
      address,
      nickname: nickname || undefined,
      isDomain,
      createdAt: new Date(),
      lastAnalyzed: null
    };

    try {
      
      const walletRef = doc(collection(db, 'solo-users', publicKey.toString(), 'wallets'));
      
      await setDoc(walletRef, walletData);
      
      return { id: walletRef.id, ...walletData };
      
    } catch (error) {
      console.error('firestore save failed:', error);
      
      if (error instanceof Error) {
        const firestoreError = error as { code?: string };
        console.error('error details:', {
          message: error.message,
          code: firestoreError.code,
          user: publicKey?.toString(),
          collection: 'solo-users'
        });
      }
      
      throw new Error(`failed to save wallet: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const savePortfolioHistory = async (totalValue: number, walletCount: number, tokenCount: number) => {
    if (!publicKey) {
      console.error('no public key - cannot save portfolio history');
      return;
    }

    if (totalValue <= 0) {
      return;
    }

    try {
      const anonymizedKey = encryptionService.anonymizePublicKey(publicKey.toString());
      const portfolioData = {
        totalValue,
        walletCount,
        tokenCount,
        timestamp: new Date()
      };

      const encryptedPortfolioData = encryptionService.encryptPortfolioHistory(
        portfolioData, 
        publicKey.toString()
      );

      const historyData = {
        timestamp: Timestamp.fromDate(new Date()),
        userId: publicKey.toString(),
        encryptedData: encryptedPortfolioData,
        randomField1: encryptionService.generateRandomEncrypted(publicKey.toString()),
        randomField2: encryptionService.generateRandomEncrypted(publicKey.toString()),
        metadata: {
          hasData: true,
          recordType: 'portfolio',
          version: '1.0',
          walletCountRange: walletCount > 10 ? '10+' : '1-10',
          tokenCountRange: tokenCount > 50 ? '50+' : tokenCount > 10 ? '10-50' : '1-10'
        }
      };

      const historyRef = doc(collection(db, 'solo-users', anonymizedKey, 'portfolioHistory')); 
      
      await setDoc(historyRef, historyData);
      
      setPortfolioHistory(prev => {
        const newHistory = [...prev, {
          timestamp: portfolioData.timestamp,
          totalValue: portfolioData.totalValue,
          walletCount: portfolioData.walletCount,
          tokenCount: portfolioData.tokenCount
        }];
        
        newHistory.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const trimmedHistory = newHistory.slice(-100);
        
        return trimmedHistory;
      });

    } catch (error) {
      console.error('failed to save encrypted portfolio history to firestore:', error);
    }
  };

  useEffect(() => {
    const totalLastValue = savedWallets.reduce((sum, wallet) => sum + (wallet.lastTotalValue || 0), 0);
    setLastLoadedPortfolioValue(totalLastValue);
  }, [savedWallets]);

  const updateWalletLastAnalyzed = async (walletAddress: string, totalValue: number = 0) => {
    if (!publicKey) return;

    try {
      const wallet = savedWallets.find(w => w.address === walletAddress);
      if (!wallet) return;

      const walletRef = doc(db, 'solo-users', publicKey.toString(), 'wallets', wallet.id);
      await setDoc(walletRef, {
        lastAnalyzed: new Date(),
        lastTotalValue: totalValue 
      }, { merge: true });
      
      setSavedWallets(prev => prev.map(w => 
        w.id === wallet.id 
          ? { ...w, lastAnalyzed: new Date(), lastTotalValue: totalValue }
          : w
      ));
    } catch (error) {
      console.error('failed to update last analyzed:', error);
    }
  };

  const deleteWalletFromFirestore = async (walletId: string) => {
    if (!publicKey) return;
    
    await deleteDoc(doc(db, 'solo-users', publicKey.toString(), 'wallets', walletId));
    setSavedWallets(prev => prev.filter(w => w.id !== walletId));
    setResults(prev => prev.filter(r => !savedWallets.find(w => w.id === walletId && w.address === r.walletAddress)));
  };

  const resolveDomain = async (domain: string): Promise<string> => {
  try {
    const cleanDomain = domain.replace('@', '').toLowerCase().trim();

    try {
      const { getDomainKey, NameRegistryState } = await import('@bonfida/spl-name-service');
      
      const { pubkey } = await getDomainKey(cleanDomain);
      const registry = await NameRegistryState.retrieve(connection, pubkey);
      const owner = registry.registry.owner.toBase58();
      
      return owner;
    } catch (snsError) {
      console.warn('spl name service resolution failed:', snsError);
    }

    try {
      const response = await fetch(connection.rpcEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getDomainNames',
          params: {
            domain: cleanDomain
          },
        }),
      });

      const data = await response.json();
      if (data.result && data.result.owner) {
        return data.result.owner;
      }
    } catch (heliusError) {
      console.warn('helius enhanced resolution failed:', heliusError);
    }

    try {
      const response = await fetch(`https://sns-sdk-proxy.bonfida.workers.dev/resolve/${cleanDomain}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data?.address) {
          return data.address;
        }
      }
    } catch (apiError) {
      console.warn('bonfida api fallback failed:', apiError);
    }

    throw new Error(`could not resolve domain: ${cleanDomain}. the domain may not exist or all resolution methods are unavailable.`);

  } catch (err) {
    console.error('domain resolution failed:', err);
    
    if (err instanceof Error) {
      if (err.message.includes('not exist') || err.message.includes('not found')) {
        throw new Error(`the domain "${domain}" doesn't exist or isn't registered on Solana.`);
      } else if (err.message.includes('currently unavailable')) {
        throw new Error(`domain resolution services are temporarily down. Please try using the wallet address directly for "${domain}".`);
      }
    }
    
    throw new Error(`failed to resolve domain "${domain}". please try using the wallet address directly.`);
  }
};

  const validateWalletAddress = (address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  };

  const isDomain = (input: string): boolean => {
    const cleanInput = input.toLowerCase().replace('@', '');
    return SNS_DOMAINS.some(domain => cleanInput.endsWith(domain));
  };

  const addWallet = async () => {
  if (!walletInput.trim()) {
    setError('please enter a wallet address or domain');
    return;
  }

  if (!publicKey) {
    setError('wallet not properly connected. please ensure your wallet is connected and try again.');
    return;
  }

  setAddingWallet(true);
  setError('');

  try {
    let address = walletInput.trim();
    let isDomainAddress = false;

    if (isDomain(address)) {
      try {
        address = await resolveDomain(address);
        isDomainAddress = true;
      } catch (resolveError) {
        const errorMsg = resolveError instanceof Error ? resolveError.message : 'unknown resolution error';
        
        if (errorMsg.includes('not exist') || errorMsg.includes('not found') || errorMsg.includes('doesn\'t exist')) {
          setError(`the domain "${walletInput}" doesn't exist or isn't registered. please check the domain and try again.`);
        } else if (errorMsg.includes('network') || errorMsg.includes('failed to fetch') || errorMsg.includes('connection')) {
          setError('network error resolving domain. please check your internet connection and try again.');
        } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
          setError('domain service is temporarily unavailable due to high demand. please try again in a few moments.');
        } else {
          setError(`failed to resolve domain "${walletInput}": ${errorMsg}`);
        }
        return;
      }
    }

    if (!validateWalletAddress(address)) {
      throw new Error(`invalid wallet address: ${address}. please check the address and try again.`);
    }

    const existingWallet = savedWallets.find(wallet => wallet.address === address);
    if (existingWallet) {
      const existingName = existingWallet.nickname || (existingWallet.isDomain ? existingWallet.address : `${existingWallet.address.slice(0, 8)}...${existingWallet.address.slice(-6)}`);
      throw new Error(`this wallet is already saved as: ${existingName}`);
    }

    const savedWallet = await saveWalletToFirestore(
      address, 
      walletNickname || undefined, 
      isDomainAddress
    );

    setSavedWallets(prev => [savedWallet, ...prev]);
    
    const existingResult = results.find(r => r.walletAddress === address);
    if (!existingResult) {
      await analyzeWallet(address, walletNickname, isDomainAddress);
    } else {
      if (walletNickname) {
        setResults(prev => prev.map(r => 
          r.walletAddress === address 
            ? { ...r, nickname: walletNickname }
            : r
        ));
      }
    }

    setWalletInput('');
    setWalletNickname('');
    
  } catch (err) {
    console.error('error in addWallet:', err);
    const errorMsg = err instanceof Error ? err.message : 'failed to add wallet';
    
    if (errorMsg.includes('already saved') || errorMsg.includes('already exists')) {
      setError(errorMsg);
    } else if (errorMsg.includes('firestore') || errorMsg.includes('permission')) {
      setError('storage error: unable to save wallet. please check your connection and try again.');
    } else if (errorMsg.includes('invalid wallet address')) {
      setError(errorMsg);
    } else {
      setError(`failed to add wallet: ${errorMsg}`);
    }
  } finally {
    setAddingWallet(false);
  }
};

const analyzeWallet = async (walletAddress: string, nickname?: string | null, isDomain: boolean = false): Promise<AnalysisResult | null> => {
  setAnalyzing(true);
  setError('');

  try {

    await new Promise(resolve => setTimeout(resolve, 500));

    let tokenBalances: TokenBalance[] = [];
    
    try {
      tokenBalances = await tokenService.getTokenBalances(walletAddress);
      
      if (tokenBalances.length === 0) {
      } else {
      }
    } catch (balanceError) {
      console.error('failed to fetch token balances:', balanceError);
      throw new Error(`unable to fetch token balances for this wallet. the wallet may be empty or there may be network issues.`);
    }

    const potentiallyValuableTokens = tokenBalances.filter(token => {
      const isSol = token.symbol.toLowerCase() === 'sol' || token.name.toLowerCase().includes('solana');
      const hasBalance = token.uiAmount > 0;
      
      return (isSol && hasBalance) || (!isSol && hasBalance);
    });

    let valuableTokens: TokenBalance[] = [];
    
    if (potentiallyValuableTokens.length > 0) {
      try {
        valuableTokens = await tokenService.getTokenPrices(potentiallyValuableTokens);
        
        valuableTokens = valuableTokens.filter(token => {
          const isSol = token.symbol.toLowerCase() === 'sol' || token.name.toLowerCase().includes('solana');
          const hasValue = (token.value || 0) > 0.01;
          const hasBalance = token.uiAmount > 0;
          
          return (isSol && hasBalance) || (!isSol && hasValue && hasBalance);
        });
      } catch (priceError) {
        console.error('price fetching failed:', priceError);
        valuableTokens = potentiallyValuableTokens.map(token => ({
          ...token,
          value: 0,
          price: 0
        }));
      }
    }

    const totalValue = valuableTokens.reduce((sum, token) => sum + (token.value || 0), 0);

    const result: AnalysisResult = {
      tokens: valuableTokens,
      totalValue,
      walletAddress,
      nickname: nickname || undefined,
      isDomain,
      analyzedAt: new Date()
    };

    setResults(prev => {
      const existingIndex = prev.findIndex(r => r.walletAddress === walletAddress);
      if (existingIndex >= 0) {
        const newResults = [...prev];
        newResults[existingIndex] = result;
        return newResults;
      }
      return [...prev, result];
    });

    await updateWalletLastAnalyzed(walletAddress, totalValue);

    if (valuableTokens.length === 0) {
      setError('no valuable tokens found in this wallet (all non-sol tokens < $0.01 value)');
    }

    return result;

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'failed to analyze wallet';
    console.error('analysis error:', err);
    
    if (errorMsg.includes('failed to fetch') || errorMsg.includes('network')) {
      setError('network error: unable to connect to solana rpc. please check your connection and try again.');
    } else if (errorMsg.includes('invalid') || errorMsg.includes('validation')) {
      setError('invalid wallet address or domain');
    } else if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
      setError('rate limited: too many requests. please wait a moment and try again.');
    } else if (errorMsg.includes('unable to fetch token balances')) {
      setError(errorMsg);
    } else {
      setError(`analysis failed: ${errorMsg}`);
    }
    
    throw err;
  } finally {
    setAnalyzing(false);
  }
};

  const analyzeAllWallets = async () => {
  if (savedWallets.length === 0) {
    setError('no saved wallets to analyze');
    return;
  }

  setAnalyzing(true);
  setError('');
  
  setLoadingProgress({
    totalItems: savedWallets.length,
    currentProcessed: 0,
    itemType: 'wallets',
    isActive: true
  });

  try {
    
    const analysisStartTime = Date.now();
    let successfulAnalyses = 0;
    let failedAnalyses = 0;

    setResults([]);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const newResults: AnalysisResult[] = [];

    for (let i = 0; i < savedWallets.length; i++) {
      const wallet = savedWallets[i];
      
      setLoadingProgress(prev => ({
        ...prev,
        currentProcessed: i
      }));
      
      try {
        const result = await analyzeWallet(wallet.address, wallet.nickname || undefined, wallet.isDomain);
        if (result) {
          newResults.push(result);
        }
        successfulAnalyses++;
      } catch (err) {
        console.error(`failed to analyze wallet ${wallet.address}:`, err);
        failedAnalyses++;
        
        if (err instanceof Error && (err.message.includes('rate limit') || err.message.includes('429'))) {
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      
      if (i < savedWallets.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    setResults(newResults);

    setLoadingProgress(prev => ({
      ...prev,
      currentProcessed: savedWallets.length
    }));

    await new Promise(resolve => setTimeout(resolve, 500));

    const totalPortfolioValue = newResults.reduce((sum, result) => sum + result.totalValue, 0);
    const totalTokens = newResults.reduce((sum, result) => sum + result.tokens.length, 0);

    if (totalPortfolioValue > 0 && newResults.length > 0) {
      await savePortfolioHistory(totalPortfolioValue, newResults.length, totalTokens);
    } else {
    }

    const event = new CustomEvent('portfolioAnalysisComplete', {
      detail: {
        totalValue: totalPortfolioValue,
        walletCount: newResults.length,
        tokenCount: totalTokens,
        timestamp: new Date()
      }
    });
    window.dispatchEvent(event);

    if (typeof window !== 'undefined' && typeof window.refreshPortfolioChart === 'function') {
      window.refreshPortfolioChart();
    }

    window.dispatchEvent(new CustomEvent('portfolioUpdated'));
    localStorage.setItem('portfolioDataUpdated', Date.now().toString());
    
    if (failedAnalyses > 0) {
      setError(`completed with ${failedAnalyses} failed analyses. check console for details.`);
    }
    
  } catch (err) {
    console.error('error analyzing all wallets:', err);
    setError(`failed to analyze some wallets: ${err instanceof Error ? err.message : 'unknown error'}`);
  } finally {
    setAnalyzing(false);
    setTimeout(() => {
      setLoadingProgress(prev => ({ ...prev, isActive: false }));
    }, 2000);
  }
};

  const downloadCsvTemplate = () => {
    const template = `address,nickname
    7aEY...f9Xq,main treasury
    your-domain.sol,team wallet
    8vM2...z4p1,investment fund
    another-domain.bonk,community wallet`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wallet-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const allTokens = useMemo(() => {
    return results.flatMap(result => 
      result.tokens.map(token => ({
        ...token,
        sourceWallet: result.walletAddress,
        sourceNickname: result.nickname || (result.isDomain ? result.walletAddress : `${result.walletAddress.slice(0, 4)}...${result.walletAddress.slice(-4)}`)
      }))
    );
  }, [results]);

  useEffect(() => {
    if (selectAllRef.current && allTokens.length > 0) {
      const allSelected = selectedTokens.size === allTokens.length;
      const someSelected = selectedTokens.size > 0 && selectedTokens.size < allTokens.length;
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [selectedTokens, allTokens]);

  const handleTokenSelect = (mint: string) => {
    setSelectedTokens(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(mint)) {
        newSelected.delete(mint);
      } else {
        newSelected.add(mint);
      }
      return newSelected;
    });
  };

  const handleSelectAll = (select: boolean) => {
    if (allTokens.length === 0) return;
    
    if (select) {
      setSelectedTokens(new Set(allTokens.map(token => token.mint)));
    } else {
      setSelectedTokens(new Set());
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const totalPortfolioValue = useMemo(() => {
    return results.reduce((sum, result) => sum + result.totalValue, 0);
  }, [results]);

  const sortedTokens = useMemo(() => {
    if (allTokens.length === 0) return [];

    const sorted = [...allTokens].sort((a, b) => {
      const aPercentage = totalPortfolioValue > 0 ? ((a.value || 0) / totalPortfolioValue * 100) : 0;
      const bPercentage = totalPortfolioValue > 0 ? ((b.value || 0) / totalPortfolioValue * 100) : 0;

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
        case 'value':
          aValue = a.value || 0;
          bValue = b.value || 0;
          break;
        case 'percentage':
          aValue = aPercentage;
          bValue = bPercentage;
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

    return sorted;
  }, [allTokens, sortField, sortDirection, totalPortfolioValue]);

  const selectedTokensValue = useMemo(() => {
    if (allTokens.length === 0) return 0;
    return allTokens
      .filter(token => selectedTokens.has(token.mint))
      .reduce((sum, token) => sum + (token.value || 0), 0);
  }, [allTokens, selectedTokens]);

  const liquidationValue = useMemo(() => {
    if (allTokens.length === 0 || !liquidationAmount) return 0;
    
    const amount = parseFloat(liquidationAmount);
    if (isNaN(amount)) return 0;

    if (liquidationType === 'percentage') {
      return (selectedTokensValue * amount) / 100;
    } else {
      return Math.min(amount, selectedTokensValue);
    }
  }, [allTokens.length, liquidationAmount, liquidationType, selectedTokensValue]);

  const calculateProRataAmounts = () => {
    if (allTokens.length === 0 || liquidationValue <= 0 || selectedTokens.size === 0) return [];

    const selectedTokenData = allTokens.filter(token => selectedTokens.has(token.mint));
    
    return selectedTokenData.map(token => {
      const tokenValue = token.value || 0;
      const tokenPercentageOfSelected = selectedTokensValue > 0 ? tokenValue / selectedTokensValue : 0;
      
      const tokenLiquidationValue = liquidationValue * tokenPercentageOfSelected;
      const tokenPrice = token.price || 1;
      const tokenAmountToSwap = tokenPrice > 0 ? tokenLiquidationValue / tokenPrice : 0;
      
      const finalSwapAmount = Math.min(tokenAmountToSwap, token.uiAmount);
      
      return {
        ...token,
        swapAmount: finalSwapAmount,
        percentage: tokenPercentageOfSelected * 100,
        liquidationAmount: tokenLiquidationValue,
        originalAmount: token.uiAmount
      };
    });
  };

  const proRataTokens = calculateProRataAmounts();
  const hasLiquidation = liquidationValue > 0 && selectedTokens.size > 0;
  const remainingPortfolioValue = totalPortfolioValue - liquidationValue;

  const generateShoppingList = () => {
  if (allTokens.length === 0) return '';

  const selectedTokenData = allTokens.filter(token => selectedTokens.has(token.mint));
  const selectedTokensValue = selectedTokenData.reduce((sum, token) => sum + (token.value || 0), 0);

  const sortedSelectedTokens = [...selectedTokenData].sort((a, b) => (b.value || 0) - (a.value || 0));
  const sortedProRataTokens = [...proRataTokens].sort((a, b) => (b.value || 0) - (a.value || 0));

  const header = `💰 multi-wallet pro-rata swap shopping list\n`;
  const timestamp = `generated: ${new Date().toLocaleString()}\n`;
  
  const targetInfo = targetToken ? `swapping to: ${targetToken.symbol} (${targetToken.name})\n` : '';
  
  const walletSummary = results.map(result => 
    `• ${result.nickname || (result.isDomain ? result.walletAddress : `${result.walletAddress.slice(0, 8)}...${result.walletAddress.slice(-6)}`)}: $${result.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  ).join('\n');
  
  const summary = `total portfolio value: $${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nwallets analyzed: ${results.length}\n${walletSummary}\n\n${targetInfo}selected tokens: ${selectedTokens.size}/${allTokens.length}\nselected value: $${selectedTokensValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
  
  let tokenList: string;
  
  if (hasLiquidation) {
    tokenList = sortedProRataTokens.map((token, index) => {
      const portfolioPercentage = totalPortfolioValue > 0 ? ((token.value || 0) / totalPortfolioValue * 100) : 0;
      const selectedPercentage = selectedTokensValue > 0 ? ((token.value || 0) / selectedTokensValue * 100) : 0;
      
      return `${(index + 1).toString().padStart(2)}. ${token.symbol.padEnd(8)} | ${token.swapAmount.toLocaleString(undefined, { maximumFractionDigits: 6 }).padStart(15)} | $${token.liquidationAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(12)} | ${selectedPercentage.toFixed(1).padStart(5)}% sel | ${portfolioPercentage.toFixed(1).padStart(5)}% port | ${token.sourceNickname}`;
    }).join('\n');
  } else {
    tokenList = sortedSelectedTokens
      .map((token, index) => {
        const portfolioPercentage = totalPortfolioValue > 0 ? ((token.value || 0) / totalPortfolioValue * 100) : 0;
        const selectedPercentage = selectedTokensValue > 0 ? ((token.value || 0) / selectedTokensValue * 100) : 0;
        
        return `${(index + 1).toString().padStart(2)}. ${token.symbol.padEnd(8)} | ${token.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 }).padStart(15)} | $${(token.value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(12)} | ${selectedPercentage.toFixed(1).padStart(5)}% sel | ${portfolioPercentage.toFixed(1).padStart(5)}% port | ${token.sourceNickname}`;
      }).join('\n');
  }

  const liquidationInfo = hasLiquidation ? 
    `\n💸 summary:\n` +
    `liquidating: $${liquidationValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
    `of selected: ${((liquidationValue / selectedTokensValue) * 100).toFixed(1)}%\n` +
    `remaining portfolio: $${remainingPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` : '';

  const footer = `\n💡 instructions:\n` +
    `• use this list with your multisig wallet for pro-rata swaps\n` +
    `• tokens are ordered by value (highest to lowest)\n` +
    `• "sel" = percentage of selected tokens\n` +
    `• "port" = percentage of total portfolio\n` +
    `• source shows which wallet holds each token`;

  const columnHeaders = 
    'no. token    |           amount |        value |  share |  share | source\n' +
    '-- ---------- | ---------------- | ------------ | ------ | ------ | ---------\n';

  return header + timestamp + summary + liquidationInfo + columnHeaders + tokenList + '\n\n' + footer;
};

useEffect(() => {
  const delayDebounceFn = setTimeout(() => {
    if (searchQuery.trim()) {
      searchTokens(searchQuery);
    } else {
      setSearchResults([]);
    }
  }, 300);

  return () => clearTimeout(delayDebounceFn);
}, [searchQuery]);

  const copyShoppingList = async () => {
    const shoppingList = generateShoppingList();
    try {
      await navigator.clipboard.writeText(shoppingList);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('failed to copy:', err);
      setError('failed to copy shopping list to clipboard');
    }
  };

  const downloadShoppingList = () => {
    const shoppingList = generateShoppingList();
    const blob = new Blob([shoppingList], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prorata-shopping-list-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvUploadError('');
    setError('');

    if (!publicKey) {
      setCsvUploadError('wallet not connected. Please connect your wallet and try again.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    try {
      const text = await file.text();
      const results = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase()
      });

      if (results.errors.length > 0) {
        throw new Error(`csv parsing error: ${results.errors[0].message}`);
      }

      const wallets = results.data as Array<{ address: string; nickname?: string }>;
      
      if (!wallets || wallets.length === 0) {
        throw new Error('no valid wallet data found in csv');
      }

      let successfulImports = 0;
      let failedImports = 0;
      const errors: string[] = [];
      const processedAddresses = new Set<string>();
      const duplicateAddresses = new Set<string>();

      for (const [index, wallet] of wallets.entries()) {
        try {
          if (!publicKey) {
            throw new Error('wallet disconnected during import');
          }

          if (!wallet.address?.trim()) {
            console.warn(`skipping empty address at row ${index + 1}`);
            failedImports++;
            errors.push(`row ${index + 1}: empty address`);
            continue;
          }

          let address = wallet.address.trim();
          let isDomainAddress = false;

          if (isDomain(address)) {
            try {
              address = await resolveDomain(address);
              isDomainAddress = true;
            } catch (resolveError) {
              console.warn(`failed to resolve domain ${wallet.address}:`, resolveError);
              failedImports++;
              errors.push(`row ${index + 1}: failed to resolve domain ${wallet.address}`);
              continue;
            }
          }

          if (!validateWalletAddress(address)) {
            console.warn(`invalid address in csv at row ${index + 1}: ${wallet.address}`);
            failedImports++;
            errors.push(`row ${index + 1}: invalid address ${wallet.address}`);
            continue;
          }

          if (processedAddresses.has(address)) {
            console.warn(`skipping duplicate address at row ${index + 1}: ${address}`);
            duplicateAddresses.add(address);
            failedImports++;
            errors.push(`row ${index + 1}: duplicate address ${wallet.address}`);
            continue;
          }

          const walletDocRef = doc(db, 'solo-users', publicKey.toString(), 'wallets', address);
          const walletDoc = await getDoc(walletDocRef);
          
          if (walletDoc.exists()) {
            console.warn(`skipping duplicate address at row ${index + 1}: ${address} (already exists in your wallets)`);
            duplicateAddresses.add(address);
            failedImports++;
            errors.push(`row ${index + 1}: address already exists in your wallets ${wallet.address}`);
            continue;
          }

          await saveWalletToFirestore(
            address,
            wallet.nickname?.trim() || undefined,
            isDomainAddress
          );

          processedAddresses.add(address);
          successfulImports++;
          
          if (index < wallets.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
        } catch (err) {
          console.error(`failed to import wallet at row ${index + 1}:`, wallet.address, err);
          failedImports++;
          errors.push(`row ${index + 1}: ${err instanceof Error ? err.message : 'unknown error'}`);
          
          if (err instanceof Error && err.message.includes('wallet not connected')) {
            setCsvUploadError('wallet disconnected during import. please reconnect and try again.');
            break;
          }
          
          if (err instanceof Error && err.message.includes('permissions')) {
            setCsvUploadError('firestore permissions error. please check your security rules.');
            break;
          }
        }
      }

      let successMessage = '';
      if (successfulImports > 0) {
        successMessage = `successfully imported ${successfulImports} wallet${successfulImports > 1 ? 's' : ''}`;
        
        if (failedImports > 0) {
          successMessage += `, ${failedImports} failed`;
        }
        
        if (duplicateAddresses.size > 0) {
          successMessage += ` (${duplicateAddresses.size} duplicate${duplicateAddresses.size > 1 ? 's' : ''} skipped)`;
        }
        
        setCsvUploadError(successMessage);
        
        try {
          const walletsQuery = query(collection(db, 'solo-users', publicKey.toString(), 'wallets'));
          const querySnapshot = await getDocs(walletsQuery);
          
          const updatedWallets = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate() || new Date(0),
              lastAnalyzed: data.lastAnalyzed?.toDate() || undefined
            };
          }) as SavedWallet[];
          
          updatedWallets.sort((a, b) => {
            const timeA = a.createdAt?.getTime() || 0;
            const timeB = b.createdAt?.getTime() || 0;
            return timeB - timeA;
          });
          
          setSavedWallets(updatedWallets);
        } catch (err) {
          console.error('failed to reload wallets after csv import:', err);
        }
      } else if (failedImports > 0) {
        let errorMessage = `no wallets were successfully imported. all ${failedImports} failed.`;
        
        if (duplicateAddresses.size > 0) {
          errorMessage += ` (${duplicateAddresses.size} duplicate${duplicateAddresses.size > 1 ? 's' : ''} found)`;
        }
        
        if (errors.length > 0) {
          const errorPreview = errors.slice(0, 3).join('; ');
          errorMessage += ` errors: ${errorPreview}${errors.length > 3 ? '...' : ''}`;
        }
        
        setCsvUploadError(errorMessage);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (err) {
      console.error('csv upload error:', err);
      const errorMsg = err instanceof Error ? err.message : 'failed to process csv file';
      setCsvUploadError(`${errorMsg}`);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    const searchArea = document.querySelector('[data-search-area]');
    if (searchArea && !searchArea.contains(event.target as Node)) {
      setSearchResults([]);
    }
  };

  document.addEventListener('mousedown', handleClickOutside);
  return () => {
    document.removeEventListener('mousedown', handleClickOutside);
  };
}, []);

  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
 <div className="min-h-screen text-white relative overflow-hidden">
  {/* Keep the overlay but make it more transparent too */}
  <div className="absolute inset-0 pointer-events-none" />
  
  <div className="relative z-10 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Header */}
        <div className="flex items-center justify-between mb-6 sm:mb-8 p-4 sm:p-5 bg-gray-800/30 rounded-2xl backdrop-blur-xl border border-gray-700/50 shadow-lg">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-gray-300 via-gray-200 to-gray-300 bg-clip-text text-transparent tracking-tight">
            solo: shop
          </h1>
          <div className="w-20"></div>
        </div>

        {/* Loading Progress */}
        {loadingProgress.isActive && (
          <div className=" mobile-full-screen mb-6 bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-700/30 shadow-xl p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-300"></div>
              <span>analyzing wallets...</span>
            </h3>
            <LoadingBar
              totalItems={loadingProgress.totalItems}
              currentProcessed={loadingProgress.currentProcessed}
              itemType={loadingProgress.itemType}
              durationPerItem={3000}
              className="mt-4"
            />
            <div className="mt-4 text-sm text-gray-400 text-center">
              processing wallet {Math.min(loadingProgress.currentProcessed + 1, loadingProgress.totalItems)} of {loadingProgress.totalItems}
              {loadingProgress.currentProcessed > 0 && (
                <span className="ml-2 text-gray-300 font-medium">
                  ({Math.round((loadingProgress.currentProcessed / loadingProgress.totalItems) * 100)}%)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Instructions Section */}
        <CollapsibleSection 
          title="instructions"
          defaultOpen={true}
          className="bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-700/30 shadow-xl mb-6"
        >
          <div className="flex items-start justify-between">
            <p className="text-sm text-gray-300 flex-1 leading-relaxed">
              enter multiple addresses to generate a combined pro-rata swapping list.
            </p>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="ml-4 p-2 bg-gray-700/50 hover:bg-gray-600/50 rounded-xl transition-all duration-200 active:scale-95"
            >
              <HelpCircle className="h-5 w-5 text-gray-400 hover:text-gray-300" />
            </button>
          </div>
          
          {showHelp && (
            <div className="mt-4 p-4 bg-gradient-to-r from-gray-500/15 to-gray-400/15 border border-gray-500/30 rounded-xl backdrop-blur-sm">
              <h4 className="font-semibold text-sm mb-3 text-gray-400">how to use:</h4>
              <ul className="text-sm text-gray-300 space-y-2 lowercase">
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                  <span>add individual wallets or upload a csv with multiple addresses</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                  <span>wallets are saved to your account for future use</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                  <span>analyze all wallets at once to see combined portfolio</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                  <span>select tokens from any wallet for pro-rata calculations</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                  <span>generate shopping lists that maintain weights across all selected tokens</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full"></div>
                  <span>each token shows which wallet it comes from</span>
                </li>
              </ul>
            </div>
          )}
        </CollapsibleSection>

        {/* Last Total Section */}
        {savedWallets.length > 0 && lastLoadedPortfolioValue > 0 && (
          <CollapsibleSection 
            title="last total"
            defaultOpen={true}
            className="bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-700/30 shadow-xl mb-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-br from-gray-500/20 to-cyan-500/20 rounded-xl border border-gray-500/30">
                  <Clock className="h-5 w-5 text-gray-400" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-gray-200">last loaded total</h3>
                  <p className="text-xs text-gray-400">
                    based on previous analysis of {savedWallets.length} wallet{savedWallets.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg sm:text-xl font-bold text-gray-400">
                  ${lastLoadedPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {results.length > 0 && (
                  <div className="text-xs text-gray-300 mt-1">
                    current: ${totalPortfolioValue.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>
        )}

        {/* Manage Wallets Section */}
        <CollapsibleSection 
          title="manage wallets"
          defaultOpen={true}
          className="bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-700/30 shadow-xl mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2 text-gray-200">
                wallet address or domain
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="enter wallet (e.g., 7aEY...f9Xq or example.sol)"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addWallet()}
                  className="w-full pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm placeholder-gray-400 transition-all duration-200"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-xs text-gray-400">try domains:</span>
                {['.sol', '.bonk', '.poor'].map(domain => (
                  <button
                    key={domain}
                    onClick={() => setWalletInput(`example${domain}`)}
                    className="text-xs text-gray-400 hover:text-gray-300 transition-colors px-2 py-1 bg-gray-500/10 hover:bg-gray-500/20 rounded-lg"
                  >
                    {domain}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-200">
                nickname
              </label>
              <input
                type="text"
                placeholder="my treasury"
                value={walletNickname}
                onChange={(e) => setWalletNickname(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm transition-all duration-200"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6">
            {/* Add Wallet */}
            <button
              onClick={addWallet}
              disabled={addingWallet || analyzing || !walletInput.trim()}
              className="flex items-center justify-center sm:justify-start space-x-2 bg-gradient-to-r from-gray-600 to-gray-500 hover:from-gray-500 hover:to-gray-400 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3 rounded-2xl transition-transform duration-200 active:scale-95 text-sm font-semibold shadow-md hover:shadow-lg text-white w-full sm:w-auto"
            >
              {addingWallet ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>adding wallet...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>add wallet</span>
                </>
              )}
            </button>

            {/* Analyze All */}
            <button
              onClick={analyzeAllWallets}
              disabled={analyzing || savedWallets.length === 0 || loadingProgress.isActive}
              className="flex items-center justify-center sm:justify-start space-x-2 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-3 rounded-2xl transition-transform duration-200 active:scale-95 text-sm font-semibold shadow-md hover:shadow-lg text-white w-full sm:w-auto"
            >
              {loadingProgress.isActive ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>analyzing... ({loadingProgress.currentProcessed}/{savedWallets.length})</span>
                </>
              ) : (
                <>
                  <Calculator className="h-4 w-4" />
                  <span>analyze all ({savedWallets.length})</span>
                </>
              )}
            </button>

            {/* Upload CSV */}
            <label className="flex items-center justify-center sm:justify-start space-x-2 bg-gray-500 hover:bg-gray-400 px-5 py-3 rounded-2xl transition-transform duration-200 active:scale-95 text-sm font-medium shadow-sm hover:shadow-md text-gray-800 cursor-pointer w-full sm:w-auto">
              <Upload className="h-4 w-4" />
              <span>upload csv</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="hidden"
              />
            </label>

            {/* Download Template */}
            <button
              onClick={downloadCsvTemplate}
              className="flex items-center justify-center sm:justify-start space-x-2 bg-gray-500 hover:bg-gray-400 px-5 py-3 rounded-2xl transition-transform duration-200 active:scale-95 text-sm font-medium shadow-sm hover:shadow-md text-gray-800 cursor-pointer w-full sm:w-auto"
            >
              <FileText className="h-4 w-4" />
              <span>template</span>
            </button>
          </div>

          {/* Error/Success Messages */}
          {(error || csvUploadError) && (
            <div className={`p-4 rounded-xl border text-sm ${
              error.includes('✅') || csvUploadError.includes('successfully imported') || csvUploadError.includes('added') 
                ? 'bg-green-500/20 border-green-500/50 text-green-200'
                : 'bg-red-500/20 border-red-500/50 text-red-200'
            }`}>
              <div className="flex items-center space-x-2">
                {error.includes('✅') || csvUploadError.includes('successfully imported') || csvUploadError.includes('added') ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <span>{error || csvUploadError}</span>
              </div>
            </div>
          )}

          {/* Saved Wallets List */}
          {savedWallets.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-4 text-gray-200 flex items-center space-x-2">
                <Wallet className="h-4 w-4 text-gray-400" />
                <span>saved wallets ({savedWallets.length})</span>
              </h4>
              <div className="space-y-3 max-h-60 overflow-y-auto mobile-scroll pr-2 -mr-2">
                {savedWallets.map((wallet) => (
                  <div
                    key={wallet.id}
                    className="flex items-center justify-between p-4 bg-gray-700/30 rounded-xl border border-gray-600/50 hover:bg-gray-700/50 hover:border-gray-500/50 transition-all duration-200 group"
                  >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <div className="p-2 bg-gradient-to-br from-gray-500/20 to-gray-400/20 rounded-lg border border-gray-500/30">
                        <Wallet className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-white truncate">
                          {wallet.nickname || (wallet.isDomain ? 
                            (wallet.address || 'Unknown domain') : 
                            `${(wallet.address || '').slice(0, 8)}...${(wallet.address || '').slice(-6)}`
                          )}
                        </div>
                        {wallet.nickname && wallet.isDomain && (
                          <div className="text-xs text-gray-400 truncate">{wallet.address}</div>
                        )}
                        {wallet.nickname && !wallet.isDomain && (
                          <div className="text-xs text-gray-400 truncate">{`${(wallet.address || '').slice(0, 8)}...${(wallet.address || '').slice(-6)}`}</div>
                        )}
                        {wallet.lastAnalyzed && (
                          <div className="text-xs text-gray-500 flex items-center space-x-1 mt-1">
                            <Clock className="h-3 w-3 lowercase" />
                            <span>last analyzed: {formatTimestamp(wallet.lastAnalyzed)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <button
                        onClick={() => analyzeWallet(wallet.address, wallet.nickname, wallet.isDomain)}
                        disabled={analyzing}
                        className="p-2 bg-gray-500/20 hover:bg-gray-400/30 border border-gray-500/30 hover:border-gray-400/50 rounded-lg transition-all duration-200 text-gray-300 hover:text-gray-100 disabled:opacity-50"
                      >
                        <Calculator className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteWalletFromFirestore(wallet.id)}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 hover:border-red-500/50 rounded-lg transition-all duration-200 text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleSection>

        {/* Results Section */}
        {results.length > 0 && (
          <div className="space-y-6">
            {/* Performance Chart */}
            <CollapsibleSection 
              title="performance" 
              defaultOpen={true}
              className="bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-700/30 shadow-xl"
            >
              <PortfolioChart 
                portfolioHistory={portfolioHistory}
                livePortfolioValue={totalPortfolioValue}
                liveTokenCount={allTokens.length}
                liveWalletCount={results.length}
                mode="multisig"
              />
            </CollapsibleSection>
            
            {/* Portfolio Analysis */}
            <CollapsibleSection 
              title="analysis"
              defaultOpen={true}
              className="mobile-full-screen bg-gray-800/30 backdrop-blur-sm border border-gray-700/30 shadow-xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-sm text-gray-300">
                    {results.length} wallet{results.length > 1 ? 's' : ''} analyzed • 
                    total value: <span className="text-green-400 font-semibold">
                      ${totalPortfolioValue.toLocaleString()}
                    </span>
                    {results[0]?.analyzedAt && (
                      <span className="text-gray-400 ml-2 lowercase">
                        • updated: {formatTimestamp(results[0].analyzedAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Portfolio History Summary */}
              {/* {portfolioHistory.length > 0 && (
                <div className="mb-6 p-4 bg-gradient-to-r from-gray-500/15 to-cyan-500/15 border border-gray-500/30 rounded-xl backdrop-blur-sm">
                  <div className="flex items-center space-x-2 mb-3">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <h3 className="font-medium text-sm text-gray-400">portfolio history</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400 text-xs font-medium mb-1">records</div>
                      <div className="text-gray-400 font-semibold">{portfolioHistory.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs font-medium mb-1">first record</div>
                      <div className="text-gray-400 font-semibold lowercase">
                        {formatTimestamp(portfolioHistory[0]?.timestamp)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs font-medium mb-1">refreshed on</div>
                      <div className="text-gray-400 font-semibold lowercase">
                        {formatTimestamp(portfolioHistory[portfolioHistory.length - 1]?.timestamp)}
                      </div>
                    </div>
                  </div>
                </div> */}
              {/* )} */}

              {/* Wallet Cards Grid */}
              <div className="mobile-full-screen grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {results
                  .sort((a, b) => b.totalValue - a.totalValue)
                  .map((result) => (
                    <div key={result.walletAddress} className="bg-gradient-to-br from-gray-700/30 to-gray-800/30 backdrop-blur-sm rounded-xl p-4 border border-gray-600/50 hover:border-gray-500/50 transition-all duration-200">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm text-white truncate">
                            {result.nickname || (result.isDomain ? result.walletAddress : `${result.walletAddress.slice(0, 8)}...${result.walletAddress.slice(-6)}`)}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">
                            {result.tokens.length} tokens
                          </p>
                          {result.analyzedAt && (
                            <p className="text-xs text-gray-500 mt-1">
                              analyzed: {formatTimestamp(result.analyzedAt)}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold text-green-400">
                            ${result.totalValue.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {((result.totalValue / totalPortfolioValue) * 100).toFixed(1)}% of total
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>

              {allTokens.length > 0 && (
                <div className="mb-6 flex items-center justify-between p-4 bg-gray-700/30 rounded-xl border border-gray-600/50">
                  <div className="flex items-center space-x-4">
                    {selectedTokens.size > 0 && (
                      <span className="text-sm text-gray-400 font-medium">
                        {selectedTokens.size} tokens selected (${selectedTokensValue.toLocaleString()})
                      </span>
                    )}
                  </div>
               
                </div>
              )}
              {selectedTokens.size > 0 && (
                <CollapsibleSection 
                  title="liquidation amount"
                  defaultOpen={true}
                  className="mb-6 bg-gray-700/20 rounded-xl border border-gray-600/30"
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <div className="flex space-x-2 mb-3">
                        <button
                          onClick={() => setLiquidationType('percentage')}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            liquidationType === 'percentage' 
                              ? 'bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg shadow-gray-500/25' 
                              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                          }`}
                        >
                          percentage
                        </button>
                        <button
                          onClick={() => setLiquidationType('dollar')}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            liquidationType === 'dollar' 
                              ? 'bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg shadow-gray-500/25' 
                              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                          }`}
                        >
                          dollar amount
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder={liquidationType === 'percentage' ? 'enter percentage...' : 'enter dollar amount...'}
                          value={liquidationAmount}
                          onChange={(e) => setLiquidationAmount(e.target.value)}
                          className="w-full pl-4 pr-12 py-3 bg-gray-600 border border-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm transition-all duration-200"
                        />
                        <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
                          {liquidationType === 'percentage' ? '%' : '$'}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-300 space-y-2">
                      {liquidationValue > 0 && (
                        <>
                          <div>liquidating: <span className="text-green-400 font-semibold">${liquidationValue.toLocaleString()}</span></div>
                          <div>remaining portfolio: <span className="text-gray-400 font-semibold">${remainingPortfolioValue.toLocaleString()}</span></div>
                          <div>of selected: <span className="text-gray-400 font-semibold">{((liquidationValue / selectedTokensValue) * 100).toLocaleString()}%</span></div>
                        </>
                      )}
                    </div>
                  </div>
                </CollapsibleSection>
              )}
              {selectedTokens.size > 0 && (
                <CollapsibleSection 
                  title="swap destination"
                  defaultOpen={true}
                  className="mb-6 bg-gray-700/20 rounded-xl border border-gray-600/30"
                >
                  <div className="space-y-4" data-search-area>
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-200">
                        search token to swap to
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <input
                          type="text"
                          placeholder="search by symbol or name (e.g., USDC, SOL, etc.)"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-gray-600 border border-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent text-sm transition-all duration-200"
                        />
                        {isSearching && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
                          </div>
                        )}
                      </div>
                      
                      {/* Search Results Dropdown */}
                      {searchResults.length > 0 && (
                        <div className="mt-2 max-h-60 overflow-y-auto bg-gray-700 border border-gray-600 rounded-xl shadow-lg">
                          {searchResults.map((token) => (
                            <button
                              key={token.mint}
                              onClick={() => {
                                setTargetToken(token);
                                setSearchResults([]);
                                setSearchQuery(token.symbol);
                              }}
                              className="w-full flex items-center space-x-3 p-3 hover:bg-gray-600 transition-colors duration-200 text-left"
                            >
                              {token.logoURI ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={token.logoURI}
                                  alt={token.symbol}
                                  className="w-6 h-6 rounded-full"
                                />
                              ) : (
                                <div className="w-6 h-6 bg-gradient-to-br from-gray-500 to-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                  {token.symbol.slice(0, 3)}
                                </div>
                              )}
                              <div className="flex-1">
                                <div className="font-medium text-sm text-white">{token.symbol}</div>
                                <div className="text-xs text-gray-400 truncate">{token.name}</div>
                              </div>
                              {targetToken?.mint === token.mint && (
                                <CheckCircle className="h-4 w-4 text-green-400" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                      {selectedTokens.size > 0 && (
                        <CollapsibleSection 
                          title="shopping list actions"
                          defaultOpen={true}
                          className="mb-6 mt-6 bg-gray-700/20 rounded-xl border border-gray-600/30"
                        >
                          <div className="flex flex-wrap gap-3">
                            <button
                              onClick={copyShoppingList}
                              disabled={!selectedTokens.size}
                              className="flex items-center space-x-2 bg-gradient-to-r from-gray-600 to-gray-500 hover:from-gray-500 hover:to-gray-400 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-95 text-sm font-medium shadow-lg hover:shadow-gray-500/25"
                            >
                              {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                              <span>{copied ? 'copied!' : 'copy shopping list'}</span>
                            </button>
                            <button
                              onClick={downloadShoppingList}
                              disabled={!selectedTokens.size}
                              className="flex items-center space-x-2 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-500 hover:to-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-3 rounded-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-95 text-sm font-medium shadow-lg hover:shadow-gray-500/25"
                            >
                              <Download className="h-4 w-4" />
                              <span>download txt</span>
                            </button>
                          </div>
                          
                          {/* Preview of what will be included */}
                          {selectedTokens.size > 0 && (
                            <div className="mt-4 p-4 bg-gray-600/30 rounded-xl border border-gray-500/30">
                              <h4 className="text-sm font-medium text-gray-200 mb-2">shopping list preview:</h4>
                              <div className="text-xs text-gray-400 space-y-1">
                                <div>• {selectedTokens.size} selected tokens from {results.length} wallets</div>
                                <div>• total value: ${selectedTokensValue.toLocaleString()}</div>
                                {targetToken && (
                                  <div>• swapping to: {targetToken.symbol} ({targetToken.name})</div>
                                )}
                                {hasLiquidation && (
                                  <div>• Liquidating: ${liquidationValue.toLocaleString()} ({((liquidationValue / selectedTokensValue) * 100).toFixed(1)}% of selected)</div>
                                )}
                              </div>
                            </div>
                          )}
                        </CollapsibleSection>
                      )}
                    {targetToken && (
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-500/15 to-gray-400/15 border border-gray-500/30 rounded-xl">
                        <div className="flex items-center space-x-3">
                          {targetToken.logoURI ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={targetToken.logoURI}
                              alt={targetToken.symbol}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-gradient-to-br from-gray-500 to-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                              {targetToken.symbol.slice(0, 3)}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-white">{targetToken.symbol}</div>
                            <div className="text-xs text-gray-300">{targetToken.name}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setTargetToken(null);
                            setSearchQuery('');
                          }}
                          className="p-1 hover:bg-red-500/20 rounded-lg transition-colors duration-200"
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </button>
                      </div>
                    )}
                  </div>
                </CollapsibleSection>
              )}

              <CollapsibleSection 
                title={`tokens • ${allTokens.length} total`}
                defaultOpen={true}
                className="bg-gray-800/30 backdrop-blur-sm rounded-2xl border border-gray-700/30 shadow-xl overflow-hidden"
              >
                <div className="overflow-x-auto mobile-scroll">
                     <div className="flex space-x-2">
                    <button
                      onClick={() => handleSelectAll(true)}
                      className="text-xs bg-gray-500 hover:bg-gray-400 text-white px-3 py-2 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-95"
                    >
                      select all
                    </button>
                    <button
                      onClick={() => handleSelectAll(false)}
                      className="text-xs bg-gray-600 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-95"
                    >
                      clear all
                    </button>
                  </div>
                  <table className="mt-2 w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b border-gray-700/70 bg-gray-800/50 backdrop-blur-sm">
                        <th className="text-left py-4 px-4 text-sm font-semibold text-gray-200 w-12">
                        </th>
                        <th 
                          className="text-left py-4 px-4 text-sm font-semibold text-gray-200 cursor-pointer hover:bg-gray-700/50 rounded-lg transition-all duration-200 group"
                          onClick={() => handleSort('symbol')}
                        >
                          <div className="flex items-center space-x-2">
                            <span>token</span>
                            <SortIcon field="symbol" sortField={sortField} sortDirection={sortDirection} />
                          </div>
                        </th>
                        <th className="text-left py-4 px-4 text-sm font-semibold text-gray-200">
                          source wallet
                        </th>
                        <th 
                          className="text-right py-4 px-4 text-sm font-semibold text-gray-200 cursor-pointer hover:bg-gray-700/50 rounded-lg transition-all duration-200 group"
                          onClick={() => handleSort('balance')}
                        >
                          <div className="flex items-center justify-end space-x-2">
                            <span>balance</span>
                            <SortIcon field="balance" sortField={sortField} sortDirection={sortDirection} />
                          </div>
                        </th>
                        <th className="text-right py-4 px-4 text-sm font-semibold text-gray-200">price</th>
                        <th 
                          className="text-right py-4 px-4 text-sm font-semibold text-gray-200 cursor-pointer hover:bg-gray-700/50 rounded-lg transition-all duration-200 group"
                          onClick={() => handleSort('value')}
                        >
                          <div className="flex items-center justify-end space-x-2">
                            <span>value</span>
                            <SortIcon field="value" sortField={sortField} sortDirection={sortDirection} />
                          </div>
                        </th>
                        <th 
                          className="text-right py-4 px-4 text-sm font-semibold text-gray-200 cursor-pointer hover:bg-gray-700/50 rounded-lg transition-all duration-200 group"
                          onClick={() => handleSort('percentage')}
                        >
                          <div className="flex items-center justify-end space-x-2">
                            <span>portfolio %</span>
                            <SortIcon field="percentage" sortField={sortField} sortDirection={sortDirection} />
                          </div>
                        </th>
                        {hasLiquidation && (
                          <th className="text-right py-4 px-4 text-sm font-semibold text-green-400">
                            swap amount
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTokens.map((token, index) => {
                        const percentage = totalPortfolioValue > 0 ? ((token.value || 0) / totalPortfolioValue * 100) : 0;
                        const proRataToken = proRataTokens.find(t => t.mint === token.mint);
                        const isSelected = selectedTokens.has(token.mint);
                        
                        return (
                          <tr 
                            key={`${token.mint}-${token.sourceWallet}`} 
                            className={`border-b border-gray-700/30 hover:bg-gray-700/40 transition-all duration-200 group ${
                              isSelected ? 'bg-gray-500/10' : index % 2 === 0 ? 'bg-gray-800/20' : 'bg-gray-800/10'
                            }`}
                          >
                            <td className="py-4 px-4">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleTokenSelect(token.mint)}
                                className="rounded-lg bg-gray-700 border-gray-600 text-gray-500 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800 w-4 h-4 transition-all duration-200"
                              />
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center space-x-3">
                                {token.logoURI ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={token.logoURI}
                                    alt={token.symbol}
                                    className="w-8 h-8 rounded-full"
                                  />
                                ) : (
                                  <div className="w-8 h-8 bg-gradient-to-br from-gray-500 to-gray-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                    {token.symbol.slice(0, 3)}
                                  </div>
                                )}
                                <div>
                                  <div className="font-semibold text-sm text-white">{token.symbol}</div>
                                  <div className="text-xs text-gray-400">{token.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center space-x-2">
                                <Wallet className="h-4 w-4 text-gray-400" />
                                <span className="text-sm text-gray-300 max-w-[120px] truncate">
                                  {token.sourceNickname}
                                </span>
                              </div>
                            </td>
                            <td className="text-right py-4 px-4 text-sm font-mono text-gray-200">
                              {token.uiAmount < 0.0001 ? token.uiAmount.toExponential(2) : token.uiAmount.toLocaleString()}
                            </td>
                            <td className="text-right py-4 px-4 text-sm font-mono text-gray-200">
                              {token.price ? `$${token.price < 0.01 ? token.price.toExponential(2) : token.price.toLocaleString()}` : 'n/a'}
                            </td>
                            <td className="text-right py-4 px-4 text-sm font-mono font-semibold text-green-400">
                              ${(token.value || 0).toLocaleString()}
                            </td>
                            <td className="text-right py-4 px-4 text-sm">
                              <div className="flex items-center justify-end space-x-3">
                                <div className="w-20 bg-gray-700 rounded-full h-2">
                                  <div 
                                    className="bg-gradient-to-r from-gray-400 to-gray-300 h-2 rounded-full transition-all duration-300" 
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                  />
                                </div>
                                <span className="w-12 text-right font-medium text-gray-200">{percentage.toFixed(2)}%</span>
                              </div>
                            </td>
                            {hasLiquidation && proRataToken && (
                              <td className="text-right py-4 px-4 text-sm font-mono font-semibold text-green-400">
                                {proRataToken.swapAmount > 0.0001 ? proRataToken.swapAmount.toLocaleString() : proRataToken.swapAmount.toExponential(2)}
                                <div className="text-xs text-gray-400">
                                  ${proRataToken.liquidationAmount.toLocaleString()}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CollapsibleSection>

              {/* Portfolio Summary */}
              {results.length > 0 && (
                <CollapsibleSection 
                  title="portfolio summary"
                  defaultOpen={true}
                  className="bg-gray-800/30 mt-6 backdrop-blur-sm rounded-2xl border border-gray-700/30 shadow-xl"
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400 text-xs font-medium mb-1">total portfolio</div>
                      <div className="text-green-400 font-bold text-lg">${totalPortfolioValue.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs font-medium mb-1">selected tokens</div>
                      <div className="text-gray-400 font-bold text-lg">
                        {selectedTokens.size}/{allTokens.length} (${selectedTokensValue.toLocaleString()})
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400 text-xs font-medium mb-1">wallets</div>
                      <div className="text-gray-400 font-bold text-lg">{results.length} active</div>
                    </div>
                  </div>
                  
                  {hasLiquidation && (
                    <div className="mt-4 pt-4 border-t border-gray-500/30">
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <div className="text-gray-400 text-xs font-medium mb-1">liquidating</div>
                          <div className="text-green-400 font-semibold">${liquidationValue.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-400 text-xs font-medium mb-1">of selected</div>
                          <div className="text-gray-400 font-semibold">
                            {((liquidationValue / selectedTokensValue) * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400 text-xs font-medium mb-1">remaining</div>
                          <div className="text-gray-400 font-semibold">${remainingPortfolioValue.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </CollapsibleSection>
              )}
            </CollapsibleSection>

            <HistoricalPortfolio 
            mode="multisig"
            currentPortfolioValue={totalPortfolioValue}
          />
          </div>
        )}

        {portfolioHistory.length === 0 && chartDataLoaded && (
          <div className="text-center py-12 text-gray-400">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-700/50 rounded-2xl flex items-center justify-center">
              <Clock className="h-8 w-8 sm:h-10 sm:w-10 text-gray-400" />
            </div>
            <p className="text-sm sm:text-base font-medium">no portfolio history available yet</p>
            <p className="text-gray-500 text-xs sm:text-sm mt-2">analyze your wallets to generate chart data</p>
          </div>
        )}
      </div>
    </div>
  </div>
);
}