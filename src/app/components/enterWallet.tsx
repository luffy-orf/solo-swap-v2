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
    ? <ChevronUp className="h-3 w-3 text-purple-400" />
    : <ChevronDown className="h-3 w-3 text-purple-400" />;
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
    console.log('loadingbar reset - totalitems:', totalItems, 'currentprocessed:', currentProcessed);
    
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
      console.log('progress update:', {
        currentProcessed,
        totalItems,
        progress: (currentProcessed / totalItems) * 100
      });
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
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300 ease-out relative"
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
          {currentProcessed} of {totalItems} processed
        </span>
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
                className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
          <span className="text-xs text-purple-300">
            fetching {itemType}...
          </span>
        </div>
      )}

      {isComplete && (
        <div className="flex items-center justify-center mt-3 space-x-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-ping" />
          <span className="text-xs text-green-300">
            all {itemType} fetched successfully!
          </span>
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
  const [loadingLastValue, setLoadingLastValue] = useState<boolean>(false);
  const [chartDataLoaded, setChartDataLoaded] = useState(false);

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
        const historyQuery = query(
          collection(db, 'solo-users', publicKey.toString(), 'portfolioHistory'),
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
        
        console.log('loaded encrypted multi-wallet portfolio history:', {
          totalRecords: querySnapshot.docs.length,
          successfullyDecrypted: successfulDecryptions,
          decryptionErrors: decryptionErrors,
          finalHistoryCount: history.length
        });

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
        
        console.log('loaded wallets:', wallets.length, 'last portfolio value:', totalLastValue);
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
      console.log('saving wallet:', { 
        address, 
        nickname, 
        isDomain, 
        user: publicKey.toString(),
        collectionPath: `solo-users/${publicKey.toString()}/wallets`
      });
      
      const walletRef = doc(collection(db, 'solo-users', publicKey.toString(), 'wallets'));
      
      console.log('firestore path:', walletRef.path);
      
      await setDoc(walletRef, walletData);
      
      console.log('wallet saved successfully to:', walletRef.path);
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
      console.log('skipping portfolio history save: totalValue is 0');
      return;
    }

    try {
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

      console.log('saving encrypted portfolio history:', {
        timestamp: historyData.timestamp.toDate(),
        userId: historyData.userId,
        dataEncrypted: true,
        metadata: historyData.metadata
      });

      const historyRef = doc(collection(db, 'solo-users', publicKey.toString(), 'portfolioHistory'));
      
      console.log('firestore path:', historyRef.path);
      
      await setDoc(historyRef, historyData);
      
      console.log('successfully saved encrypted portfolio history to firestore');
      
      setPortfolioHistory(prev => {
        const newHistory = [...prev, {
          timestamp: portfolioData.timestamp,
          totalValue: portfolioData.totalValue,
          walletCount: portfolioData.walletCount,
          tokenCount: portfolioData.tokenCount
        }];
        
        newHistory.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const trimmedHistory = newHistory.slice(-100);
        
        console.log('updated portfolio history state:', trimmedHistory.length, 'records');
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
      
      console.log('updated last analyzed for wallet:', walletAddress, 'with value:', totalValue);
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
    console.log(`resolving domain: ${cleanDomain}`);

    try {
      console.log('trying spl name service resolution...');
      const { getDomainKey, NameRegistryState } = await import('@bonfida/spl-name-service');
      
      const { pubkey } = await getDomainKey(cleanDomain);
      const registry = await NameRegistryState.retrieve(connection, pubkey);
      const owner = registry.registry.owner.toBase58();
      
      console.log(`resolved ${cleanDomain} to: ${owner} via spl name service`);
      return owner;
    } catch (snsError) {
      console.warn('spl name service resolution failed:', snsError);
    }

    // try {
    //   console.log('trying getDomainOwner rpc method...');
    //   const domainOwner = await connection.getDomainOwner(cleanDomain);
    //   if (domainOwner) {
    //     console.log(`resolved ${cleanDomain} to: ${domainOwner.toBase58()} via getDomainOwner`);
    //     return domainOwner.toBase58();
    //   }
    // } catch (domainOwnerError) {
    //   console.warn('getDomainOwner resolution failed:', domainOwnerError);
    // }

    try {
      console.log('trying enhanced helius rpc resolution...');
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
        console.log(`resolved ${cleanDomain} to: ${data.result.owner} via helius enhanced api`);
        return data.result.owner;
      }
    } catch (heliusError) {
      console.warn('helius enhanced resolution failed:', heliusError);
    }

    try {
      console.log('trying bonfida api fallback...');
      const response = await fetch(`https://sns-sdk-proxy.bonfida.workers.dev/resolve/${cleanDomain}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data?.address) {
          console.log(`resolved ${cleanDomain} to: ${data.address} via bonfida api`);
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
      console.log('resolving domain:', address);
      try {
        address = await resolveDomain(address);
        isDomainAddress = true;
        console.log('resolved to address:', address);
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

    console.log('saving wallet:', {
      address,
      nickname: walletNickname,
      isDomain: isDomainAddress,
      user: publicKey.toString()
    });

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
      console.log('wallet already analyzed, skipping analysis');
      if (walletNickname) {
        setResults(prev => prev.map(r => 
          r.walletAddress === address 
            ? { ...r, nickname: walletNickname }
            : r
        ));
      }
    }
    
    console.log('wallet added successfully');
    
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
    console.log('analyzing wallet:', walletAddress);

    await new Promise(resolve => setTimeout(resolve, 500));

    let tokenBalances: TokenBalance[] = [];
    
    try {
      tokenBalances = await tokenService.getTokenBalances(walletAddress);
      
      if (tokenBalances.length === 0) {
        console.log('no tokens found in wallet:', walletAddress);
      } else {
        console.log(`found ${tokenBalances.length} tokens in wallet:`, walletAddress);
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

    console.log(`filtered to ${potentiallyValuableTokens.length} potentially valuable tokens`);

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
        
        console.log(`final valuable tokens: ${valuableTokens.length}`);
      } catch (priceError) {
        console.error('price fetching failed:', priceError);
        valuableTokens = potentiallyValuableTokens.map(token => ({
          ...token,
          value: 0,
          price: 0
        }));
        
        console.log('using tokens with zero value due to price API failure');
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

    console.log('analysis complete:', {
      wallet: walletAddress,
      tokens: valuableTokens.length,
      totalValue,
      analyzedAt: result.analyzedAt,
      solBalance: valuableTokens.find(t => t.symbol.toLowerCase() === 'sol')?.uiAmount || 0
    });

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
    console.log(`starting sequential analysis of ${savedWallets.length} wallets...`);
    
    const analysisStartTime = Date.now();
    let successfulAnalyses = 0;
    let failedAnalyses = 0;

    setResults([]);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const newResults: AnalysisResult[] = [];

    for (let i = 0; i < savedWallets.length; i++) {
      const wallet = savedWallets[i];
      console.log(`analyzing wallet ${i + 1}/${savedWallets.length}: ${wallet.address}`);
      
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
          console.log('rate limited, waiting 10 secs...');
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
      
      if (i < savedWallets.length - 1) {
        console.log(`waiting 3 seconds before next wallet analysis...`);
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
    
    console.log('final portfolio summary for saving:', {
      totalValue: totalPortfolioValue,
      walletCount: newResults.length,
      tokenCount: totalTokens,
      resultsCount: newResults.length,
      results: newResults.map(r => ({ wallet: r.walletAddress, value: r.totalValue }))
    });

    if (totalPortfolioValue > 0 && newResults.length > 0) {
      await savePortfolioHistory(totalPortfolioValue, newResults.length, totalTokens);
      console.log('portfolio history saved successfully');
    } else {
      console.log('skipping portfolio history save: total value is 0 or no results');
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
      console.log('triggering portfolio chart refresh');
      window.refreshPortfolioChart();
    }

    window.dispatchEvent(new CustomEvent('portfolioUpdated'));
    localStorage.setItem('portfolioDataUpdated', Date.now().toString());

    const analysisTime = Date.now() - analysisStartTime;
    console.log(`completed analysis of ${successfulAnalyses}/${savedWallets.length} wallets in ${analysisTime}ms`);
    
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
  }, [liquidationAmount, liquidationType, selectedTokensValue]);

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
    
    const walletSummary = results.map(result => 
      `• ${result.nickname || (result.isDomain ? result.walletAddress : `${result.walletAddress.slice(0, 8)}...${result.walletAddress.slice(-6)}`)}: $${result.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ).join('\n');
    
    const summary = `total portfolio value: $${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\nwallets analyzed: ${results.length}\n${walletSummary}\n\nselected tokens: ${selectedTokens.size}/${allTokens.length}\nselected value: $${selectedTokensValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
    
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

      console.log(`processing csv with ${wallets.length} wallets for user:`, publicKey.toString());

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
            console.log(`resolving domain from csv: ${address}`);
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
          console.log('reloaded wallets after csv import:', updatedWallets.length);
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

  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            solo: shop
          </h1>
          <div className="w-20"></div>
        </div>

       {loadingProgress.isActive && (
  <div className="mb-6 bg-gray-800/50 rounded-xl p-6 backdrop-blur-sm border border-gray-700">
    <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div>
      <span>analyzing wallets...</span>
    </h3>
    <LoadingBar
      totalItems={loadingProgress.totalItems}
      currentProcessed={loadingProgress.currentProcessed}
      itemType={loadingProgress.itemType}
      durationPerItem={3000}
      className="mt-4"
    />
    <div className="mt-3 text-sm text-gray-400 text-center">
      processing wallet {Math.min(loadingProgress.currentProcessed + 1, loadingProgress.totalItems)} of {loadingProgress.totalItems}
      {loadingProgress.currentProcessed > 0 && (
        <span className="ml-2 text-purple-400">
          ({Math.round((loadingProgress.currentProcessed / loadingProgress.totalItems) * 100)}%)
        </span>
      )}
    </div>
  </div>
)}

        {/* Help Section */}
        <CollapsibleSection 
          title="instructions"
          defaultOpen={true}
          className="mb-6"
        >
          <div className="flex items-start justify-between">
            <p className="text-sm text-gray-300 flex-1">
              enter multiple wallet addresses to generate a combined pro-rata swap shopping list for multisig wallets.
              perfect for managing multiple treasury wallets and multisig setups that can&apos;t connect directly to dapps.
            </p>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="ml-4 text-gray-400 hover:text-gray-300 transition-colors flex-shrink-0"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
          
          {showHelp && (
            <div className="mt-3 p-3 bg-purple-500/20 border border-purple-500/50 rounded-lg">
              <h4 className="font-semibold text-sm mb-2">how to use:</h4>
              <ul className="text-xs text-gray-300 space-y-1 lowercase">
                <li>• add individual wallets or upload a csv with multiple addresses</li>
                <li>• Wallets are saved to your account for future use</li>
                <li>• Analyze all wallets at once to see combined portfolio</li>
                <li>• Select tokens from any wallet for pro-rata calculations</li>
                <li>• Generate shopping lists that maintain weights across all selected tokens</li>
                <li>• Each token shows which wallet it comes from</li>
              </ul>
            </div>
          )}
        </CollapsibleSection>

        {savedWallets.length > 0 && lastLoadedPortfolioValue > 0 && (
          <CollapsibleSection 
            title="last total"
            defaultOpen={true}
            className="mb-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Clock className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="font-medium text-sm">last loaded total</h3>
                  <p className="text-xs text-gray-300">
                    based on previous analysis of {savedWallets.length} wallet{savedWallets.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-blue-400">
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

        <CollapsibleSection 
          title="manage wallets"
          defaultOpen={true}
          className="mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2 lowercase">
                Wallet Address or Domain
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="enter wallet (e.g., 7aEY...f9Xq)"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'enter' && addWallet()}
                  className="w-full pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="text-xs text-gray-400">try:</span>
                {['.sol', '.bonk', '.poor'].map(domain => (
                  <button
                    key={domain}
                    onClick={() => setWalletInput(`example${domain}`)}
                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {domain}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                nickname
              </label>
              <input
                type="text"
                placeholder="my treasury"
                value={walletNickname}
                onChange={(e) => setWalletNickname(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={addWallet}
              disabled={addingWallet || analyzing || !walletInput.trim()}
              className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
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

            <button
              onClick={analyzeAllWallets}
              disabled={analyzing || savedWallets.length === 0 || loadingProgress.isActive}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
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

            <button
              onClick={downloadCsvTemplate}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
            >
              <FileText className="h-4 w-4" />
              <span>download csv template</span>
            </button>

            <label className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors cursor-pointer">
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
          </div>

          {(error || csvUploadError) && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${
            error.includes('✅') || csvUploadError.includes('successfully imported') || csvUploadError.includes('added') 
              ? 'bg-green-500/20 border border-green-500 text-green-200'
              : 'bg-red-500/20 border border-red-500 text-red-200'
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

          {savedWallets.length > 0 && (
            <div className="mt-6">
              <h4 className="text-sm font-medium mb-3">saved wallets</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {savedWallets.map((wallet) => (
                  <div
                    key={wallet.id}
                    className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <Wallet className="h-4 w-4 text-purple-400" />
                      <div>
                        <div className="text-sm font-medium">
                          {wallet.nickname || (wallet.isDomain ? 
                            (wallet.address || 'Unknown domain') : 
                            `${(wallet.address || '').slice(0, 8)}...${(wallet.address || '').slice(-6)}`
                          )}
                        </div>
                        {wallet.nickname && wallet.isDomain && (
                          <div className="text-xs text-gray-400">{wallet.address}</div>
                        )}
                        {wallet.nickname && !wallet.isDomain && (
                          <div className="text-xs text-gray-400">{`${(wallet.address || '').slice(0, 8)}...${(wallet.address || '').slice(-6)}`}</div>
                        )}
                        {wallet.lastAnalyzed && (
                          <div className="text-xs text-gray-500 flex items-center space-x-1 mt-1">
                            <Clock className="h-3 w-3 lowercase" />
                            <span>last analyzed: {formatTimestamp(wallet.lastAnalyzed)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => analyzeWallet(wallet.address, wallet.nickname, wallet.isDomain)}
                        disabled={analyzing}
                        className="text-green-400 hover:text-green-300 transition-colors p-1"
                      >
                        <Calculator className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteWalletFromFirestore(wallet.id)}
                        className="text-red-400 hover:text-red-300 transition-colors p-1"
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

        {results.length > 0 && (
        <div className="space-y-6">
            <CollapsibleSection 
              title="performance" 
              defaultOpen={true}
            >
              <PortfolioChart 
                portfolioHistory={portfolioHistory}
                livePortfolioValue={totalPortfolioValue}
                liveTokenCount={allTokens.length}
                liveWalletCount={results.length}
                mode="multisig"
              />
            </CollapsibleSection>
            
            <CollapsibleSection 
              title="portfolio analysis"
              defaultOpen={true}
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-semibold mb-2">portfolio analysis</h2>
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

              {portfolioHistory.length > 0 && (
                <div className="mb-6 p-4 bg-blue-500/20 border border-blue-500 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <Clock className="h-4 w-4 text-blue-400" />
                    <h3 className="font-medium text-sm">portfolio history</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <div className="text-gray-400">records</div>
                      <div className="text-blue-400 font-semibold">{portfolioHistory.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">first record</div>
                      <div className="text-blue-400 font-semibold lowercase">
                        {formatTimestamp(portfolioHistory[0]?.timestamp)}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">refreshed on</div>
                      <div className="text-blue-400 font-semibold lowercase">
                        {formatTimestamp(portfolioHistory[portfolioHistory.length - 1]?.timestamp)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {results
                  .sort((a, b) => b.totalValue - a.totalValue)
                  .map((result) => (
                    <div key={result.walletAddress} className="bg-gray-700/30 rounded-lg p-4 border border-gray-600">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-sm">
                            {result.nickname || (result.isDomain ? result.walletAddress : `${result.walletAddress.slice(0, 8)}...${result.walletAddress.slice(-6)}`)}
                          </h3>
                          <p className="text-xs text-gray-400 mt-1">
                            {result.tokens.length} tokens
                          </p>
                          {result.analyzedAt && (
                            <p className="text-xs text-gray-500 mt-1 lowercase">
                              analyzed: {formatTimestamp(result.analyzedAt)}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
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
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {/* <div className="flex items-center space-x-2">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        checked={selectedTokens.size === allTokens.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500 w-4 h-4"
                      />
                      <span className="text-sm text-gray-300">select all</span>
                    </div> */}
                    {selectedTokens.size > 0 && (
                      <span className="text-sm text-purple-400">
                        {selectedTokens.size} tokens selected (${selectedTokensValue.toLocaleString()})
                      </span>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleSelectAll(true)}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors px-2 py-1"
                    >
                      select all
                    </button>
                    <button
                      onClick={() => handleSelectAll(false)}
                      className="text-xs text-gray-400 hover:text-gray-300 transition-colors px-2 py-1"
                    >
                      clear all
                    </button>
                  </div>
                </div>
              )}

              {selectedTokens.size > 0 && (
                <CollapsibleSection 
                  title="liquidation amount"
                  defaultOpen={true}
                  className="mb-6"
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <div className="flex space-x-2 mb-2">
                        <button
                          onClick={() => setLiquidationType('percentage')}
                          className={`px-3 py-1 rounded text-xs ${
                            liquidationType === 'percentage' 
                              ? 'bg-purple-600 text-white' 
                              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                          }`}
                        >
                          percentage
                        </button>
                        <button
                          onClick={() => setLiquidationType('dollar')}
                          className={`px-3 py-1 rounded text-xs ${
                            liquidationType === 'dollar' 
                              ? 'bg-purple-600 text-white' 
                              : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                          }`}
                        >
                          dollar amount
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder={liquidationType === 'percentage' ? 'Enter percentage...' : 'Enter dollar amount...'}
                          value={liquidationAmount}
                          onChange={(e) => setLiquidationAmount(e.target.value)}
                          className="w-full pl-3 pr-8 py-2 bg-gray-600 border border-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm">
                          {liquidationType === 'percentage' ? '%' : '$'}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-300 lowercase">
                      {liquidationValue > 0 && (
                        <>
                          <div>liquidating: <span className="text-green-400">${liquidationValue.toLocaleString()}</span></div>
                          <div>remaining portfolio: <span className="text-blue-400">${remainingPortfolioValue.toLocaleString()}</span></div>
                          <div>Of Selected: <span className="text-purple-400">{((liquidationValue / selectedTokensValue) * 100).toLocaleString()}%</span></div>
                        </>
                      )}
                    </div>
                  </div>
                </CollapsibleSection>
              )}

              {/* Shopping list actions */}
              {selectedTokens.size > 0 && (
                <CollapsibleSection 
                  title="shopping list actions"
                  defaultOpen={true}
                  className="mb-6"
                >
                  <div className="flex space-x-3">
                    <button
                      onClick={copyShoppingList}
                      disabled={!selectedTokens.size}
                      className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
                    >
                      {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      <span>{copied ? 'copied!' : 'copy shopping list'}</span>
                    </button>
                    <button
                      onClick={downloadShoppingList}
                      disabled={!selectedTokens.size}
                      className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>download txt</span>
                    </button>
                  </div>
                </CollapsibleSection>
              )}

              <CollapsibleSection 
                title="tokens"
                defaultOpen={true}
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px]">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="text-left py-3 px-2 text-sm font-medium w-10">
                          {/* <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={selectedTokens.size === allTokens.length}
                            onChange={(e) => handleSelectAll(e.target.checked)}
                            className="rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500 w-4 h-4"
                          /> */}
                        </th>
                        <th 
                          className="text-left py-3 px-2 text-sm font-medium cursor-pointer hover:bg-gray-700/50 rounded transition-colors"
                          onClick={() => handleSort('symbol')}
                        >
                          <div className="flex items-center space-x-1">
                            <span>token</span>
                            <SortIcon field="symbol" sortField={sortField} sortDirection={sortDirection} />
                          </div>
                        </th>
                        <th className="text-left py-3 px-2 text-sm font-medium">
                          source wallet
                        </th>
                        <th 
                          className="text-right py-3 px-2 text-sm font-medium cursor-pointer hover:bg-gray-700/50 rounded transition-colors"
                          onClick={() => handleSort('balance')}
                        >
                          <div className="flex items-center justify-end space-x-1">
                            <span>balance</span>
                            <SortIcon field="balance" sortField={sortField} sortDirection={sortDirection} />
                          </div>
                        </th>
                        <th className="text-right py-3 px-2 text-sm font-medium">Price</th>
                        <th 
                          className="text-right py-3 px-2 text-sm font-medium cursor-pointer hover:bg-gray-700/50 rounded transition-colors"
                          onClick={() => handleSort('value')}
                        >
                          <div className="flex items-center justify-end space-x-1">
                            <span>value</span>
                            <SortIcon field="value" sortField={sortField} sortDirection={sortDirection} />
                          </div>
                        </th>
                        <th 
                          className="text-right py-3 px-2 text-sm font-medium cursor-pointer hover:bg-gray-700/50 rounded transition-colors"
                          onClick={() => handleSort('percentage')}
                        >
                          <div className="flex items-center justify-end space-x-1">
                            <span>portfolio %</span>
                            <SortIcon field="percentage" sortField={sortField} sortDirection={sortDirection} />
                          </div>
                        </th>
                        {hasLiquidation && (
                          <th className="text-right py-3 px-2 text-sm font-medium text-green-400">
                            swap amount
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTokens.map((token) => {
                        const percentage = totalPortfolioValue > 0 ? ((token.value || 0) / totalPortfolioValue * 100) : 0;
                        const proRataToken = proRataTokens.find(t => t.mint === token.mint);
                        const isSelected = selectedTokens.has(token.mint);
                        
                        return (
                          <tr 
                            key={`${token.mint}-${token.sourceWallet}`} 
                            className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${
                              isSelected ? 'bg-purple-500/10' : ''
                            }`}
                          >
                            <td className="py-3 px-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleTokenSelect(token.mint)}
                                className="rounded bg-gray-700 border-gray-600 text-purple-500 focus:ring-purple-500 w-4 h-4"
                              />
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center space-x-3">
                                {token.logoURI ? (
                                  <img
                                    src={token.logoURI}
                                    alt={token.symbol}
                                    className="w-6 h-6 rounded-full"
                                  />
                                ) : (
                                  <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                                    {token.symbol.slice(0, 3)}
                                  </div>
                                )}
                                <div>
                                  <div className="font-medium text-sm lowercase">{token.symbol}</div>
                                  <div className="text-xs text-gray-400 lowercase">{token.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex items-center space-x-2">
                                <Wallet className="h-3 w-3 text-purple-400" />
                                <span className="text-xs text-gray-300 max-w-[120px] truncate">
                                  {token.sourceNickname}
                                </span>
                              </div>
                            </td>
                            <td className="text-right py-3 px-2 text-sm">
                              {token.uiAmount < 0.0001 ? token.uiAmount.toExponential(2) : token.uiAmount.toLocaleString()}
                            </td>
                            <td className="text-right py-3 px-2 text-sm">
                              {token.price ? `$${token.price < 0.01 ? token.price.toExponential(2) : token.price.toLocaleString()}` : 'n/a'}
                            </td>
                            <td className="text-right py-3 px-2 text-sm font-medium">
                              ${(token.value || 0).toLocaleString()}
                            </td>
                            <td className="text-right py-3 px-2 text-sm">
                              <div className="flex items-center justify-end space-x-2">
                                <div className="w-16 bg-gray-700 rounded-full h-2">
                                  <div 
                                    className="bg-green-400 h-2 rounded-full" 
                                    style={{ width: `${Math.min(percentage, 100)}%` }}
                                  />
                                </div>
                                <span className="w-12 text-right">{percentage.toFixed(2)}%</span>
                              </div>
                            </td>
                            {hasLiquidation && proRataToken && (
                              <td className="text-right py-3 px-2 text-sm text-green-400 font-medium">
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

              {/* Portfolio summary */}
              {results.length > 0 && (
                <CollapsibleSection 
                  title="portfolio summary"
                  defaultOpen={true}
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-400">total portfolio</div>
                      <div className="text-green-400 font-semibold">${totalPortfolioValue.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-400">selected tokens</div>
                      <div className="text-purple-400 font-semibold">
                        {selectedTokens.size}/{allTokens.length} (${selectedTokensValue.toLocaleString()})
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-400">wallets</div>
                      <div className="text-blue-400 font-semibold">{results.length} active</div>
                    </div>
                  </div>
                  
                  {hasLiquidation && (
                    <div className="mt-3 pt-3 border-t border-purple-500/30">
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div>
                          <div className="text-gray-400">liquidating</div>
                          <div className="text-green-400 font-semibold">${liquidationValue.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">of selected</div>
                          <div className="text-purple-400 font-semibold">
                            {((liquidationValue / selectedTokensValue) * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400">remaining</div>
                          <div className="text-blue-400 font-semibold">${remainingPortfolioValue.toLocaleString()}</div>
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
            onPortfolioSelect={(portfolio) => {
              console.log('selected multi-wallet portfolio:', portfolio);
            }}
          />
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg">
            <div className="flex items-center space-x-2 text-red-200">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}
        {portfolioHistory.length === 0 && chartDataLoaded && (
        <div className="text-center py-8 text-gray-500">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>no portfolio history available yet. analyze your wallets to generate chart data.</p>
        </div>
        )}
      </div>
    </div>
  );
}