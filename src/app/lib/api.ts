import { Connection, PublicKey } from '@solana/web3.js';
import { TokenBalance, TokenInfo, PriceProgress } from '../types/token';

const HELIUS_RPC_URL = process.env.NEXT_PUBLIC_HELIUS_API_KEY 
  ? `https://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`
  : 'https://mainnet.helius-rpc.com/';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

interface ParsedTokenAccountInfo {
  mint: string;
  tokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number;
  };
}

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: ParsedTokenAccountInfo;
      };
    };
  };
}

interface HeliusAssetContent {
  metadata?: {
    symbol?: string;
    name?: string;
  };
  links?: {
    image?: string;
  };
  files?: Array<{
    uri?: string;
  }>;
}

interface HeliusAsset {
  id: string;
  content?: HeliusAssetContent;
  token_info?: {
    price_info?: {
      price_per_token?: number;
      total_price?: number;
    };
  };
}

const RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_RPC_ENDPOINT_1,
  process.env.NEXT_PUBLIC_RPC_ENDPOINT_2,
].filter(Boolean) as string[]; 

const FALLBACK_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com'
];

class LoadBalancer {
  private currentIndex = 0;

  constructor(private endpoints: string[]) {
    if (endpoints.length === 0) {
      this.endpoints = FALLBACK_RPC_ENDPOINTS;
      console.warn('using fallback rpc endpoints. please configure RPC_ENDPOINT environment variables for better performance.');
    }
  }

  async getNextEndpoint(): Promise<string> {
    const endpoint = this.endpoints[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    return endpoint;
  }

  async executeWithRetry<T>(
    operation: (endpoint: string) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const endpoint = await this.getNextEndpoint();
      
      try {
        const result = await operation(endpoint);
        return result;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'unknown error occurred';
        lastError = new Error(errorMessage);
        
        if (errorMessage.includes('403') || errorMessage.includes('429') || errorMessage.includes('401')) {
          continue;
        }
      }
    }
    
    throw new Error(`all rpc endpoints failed after ${maxRetries} attempts. last error: ${lastError?.message}`);
  }

  public getEndpointName(endpoint: string): string {
    if (endpoint.includes('quiknode')) return 'quicknode';
    if (endpoint.includes('helius')) return 'helius';
    if (endpoint.includes('alchemy')) return 'alchemy';
    if (endpoint.includes('serum')) return 'serum';
    if (endpoint.includes('mainnet-beta')) return 'solana mainnet';
    return 'custom rpc';
  }

  getEndpoints(): string[] {
    return this.endpoints;
  }
}

const rpcLoadBalancer = new LoadBalancer(RPC_ENDPOINTS);

export class TokenService {
  private static instance: TokenService | null = null;
  private tokenMap: Map<string, TokenInfo> = new Map();
  private tokenListLoaded: boolean = false;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly PRICE_CACHE_DURATION = 60000;

  private constructor() {
    this.loadTokenList();
  }

  public static getInstance(): TokenService {
    if (!TokenService.instance) {
      TokenService.instance = new TokenService();
    }
    return TokenService.instance;
  }

  private createConnection(endpoint: string): Connection {
    return new Connection(endpoint, 'confirmed');
  }

  private async loadTokenList(): Promise<void> {
    if (this.tokenListLoaded) return;

    try {
      const response = await fetch('https://cache.jup.ag/tokens');
      
      if (response.ok) {
        const tokens = await response.json();
        
        tokens.forEach((token: TokenInfo) => {
          if (token.address) {
            this.tokenMap.set(token.address, token);
          }
        });
        
        this.tokenListLoaded = true;
        return;
      }
    } catch (error) {
      console.warn('failed to load token list:', error);
    }

    const fallbackTokens = [
      {
        address: 'So11111111111111111111111111111111111111112',
        symbol: 'SOL',
        name: 'Wrapped Solana',
        decimals: 9,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        chainId: 101
      },
      {
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
        chainId: 101
      },
      {
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        symbol: 'USDT',
        name: 'USDT',
        decimals: 6,
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
        chainId: 101
      }
    ];

    fallbackTokens.forEach(token => {
      this.tokenMap.set(token.address, token);
    });
    
    this.tokenListLoaded = true;
  }

  async ensureTokenListLoaded(): Promise<void> {
    if (!this.tokenListLoaded) {
      await this.loadTokenList();
    }
  }

  async getTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    await this.ensureTokenListLoaded();

    return await rpcLoadBalancer.executeWithRetry(async (endpoint) => {
      const connection = this.createConnection(endpoint);
      const publicKey = new PublicKey(walletAddress);
      
      const [tokenAccounts, solBalance] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(
          publicKey,
          { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
        ),
        connection.getBalance(publicKey)
      ]);

      const tokens: TokenBalance[] = [];

      if (solBalance > 0) {
        const solAmount = solBalance / 1e9;
        tokens.push({
          mint: 'So11111111111111111111111111111111111111112',
          symbol: 'SOL',
          name: 'Solana',
          balance: solBalance,
          decimals: 9,
          uiAmount: solAmount,
          price: 0,
          value: 0,
          selected: false,
          logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
        });
      }

      const mintAddresses = tokenAccounts.value
        .map((account: ParsedTokenAccount) => {
          try {
            const accountInfo = account.account.data.parsed.info;
            const tokenAmount = accountInfo.tokenAmount;
            if (tokenAmount.uiAmount > 0) {
              return accountInfo.mint;
            }
          } catch (error) {
            console.warn('error processing token account:', error);
          }
          return null;
        })
        .filter((mint: string | null): mint is string => mint !== null);

      const tokenMetadataMap = await this.fetchTokenMetadataBatch(mintAddresses);

      for (const account of tokenAccounts.value as ParsedTokenAccount[]) {
        try {
          const accountInfo = account.account.data.parsed.info;
          const mint = accountInfo.mint;
          const tokenAmount = accountInfo.tokenAmount;
          
          if (tokenAmount.uiAmount > 0) {
            const heliusMetadata = tokenMetadataMap.get(mint);
            const tokenInfo = this.tokenMap.get(mint);
            
            tokens.push({
              mint: mint,
              symbol: heliusMetadata?.symbol || tokenInfo?.symbol || 'UNKNOWN',
              name: heliusMetadata?.name || tokenInfo?.name || 'Unknown Token',
              balance: Number(tokenAmount.amount),
              decimals: tokenAmount.decimals,
              uiAmount: tokenAmount.uiAmount,
              price: 0,
              value: 0,
              selected: false,
              logoURI: heliusMetadata?.logoURI || tokenInfo?.logoURI || null
            });
          }
        } catch (error) {
        }
      }
      return tokens;
    });
  }

  private async fetchTokenMetadataBatch(mintAddresses: string[]): Promise<Map<string, { symbol: string; name: string; logoURI: string | null }>> {
    const metadataMap = new Map<string, { symbol: string; name: string; logoURI: string | null }>();
    
    if (mintAddresses.length === 0) return metadataMap;

    try {
      const response = await fetch(HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'getAssetBatch',
          params: {
            ids: mintAddresses
          }
        })
      });

      if (response.ok) {
        const data: { result?: HeliusAsset[] } = await response.json();
        if (Array.isArray(data.result)) {
          data.result.forEach((asset) => {
            if (asset && asset.id) {
              const symbol = asset.content?.metadata?.symbol || asset.content?.metadata?.name?.split(' ')[0] || 'UNKNOWN';
              const name = asset.content?.metadata?.name || 'Unknown Token';
              const logoURI = asset.content?.links?.image || asset.content?.files?.[0]?.uri || null;
              
              metadataMap.set(asset.id, { symbol, name, logoURI });
            }
          });
        }
      }
    } catch (error) {
      console.warn('failed to fetch token metadata from Helius:', error);
    }

    return metadataMap;
  }

  async getTokenPrices(
    tokens: TokenBalance[], 
    onProgress?: (progress: PriceProgress) => void
  ): Promise<TokenBalance[]> {
    
    if (tokens.length === 0) {
      return [];
    }

    const now = Date.now();
    const cachedResults: TokenBalance[] = [];
    const tokensToFetch: TokenBalance[] = [];

    for (const token of tokens) {
      const cached = this.priceCache.get(token.mint);
      if (cached && (now - cached.timestamp) < this.PRICE_CACHE_DURATION) {
        const value = cached.price * token.uiAmount;
        cachedResults.push({
          ...token,
          price: cached.price,
          value
        });
      } else {
        tokensToFetch.push(token);
      }
    }

    if (tokensToFetch.length === 0) {
      if (onProgress) {
        onProgress({
          current: tokens.length,
          total: tokens.length,
          currentToken: 'complete'
        });
      }
      return cachedResults;
    }

    try {
      const mintAddresses = tokensToFetch.map(t => t.mint);
      
      const response = await fetch(HELIUS_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: '1',
          method: 'getAssetBatch',
          params: {
            ids: mintAddresses
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Helius API error: ${response.status}`);
      }

      const data: { result?: HeliusAsset[] } = await response.json();
      
      if (Array.isArray(data.result)) {
        const priceMap = new Map<string, number>();
        const assetMap = new Map<string, HeliusAsset>();
        
        data.result.forEach((asset) => {
          if (asset && asset.id) {
            assetMap.set(asset.id, asset);
          }
        });
        
        tokensToFetch.forEach((token) => {
          const asset = assetMap.get(token.mint);
          
          let price = 0;

          if (asset) {
            const priceInfo = asset.token_info?.price_info;
            
            if (priceInfo && priceInfo.price_per_token) {
              price = priceInfo.price_per_token;
              
              this.priceCache.set(token.mint, {
                price,
                timestamp: now
              });
            } else if (token.mint === USDC_MINT) {
              price = 1;
              this.priceCache.set(token.mint, {
                price: 1,
                timestamp: now
              });
            } else if (token.mint === SOL_MINT) {
              if (priceInfo?.total_price && token.uiAmount > 0) {
                price = priceInfo.total_price / token.uiAmount;
              }
              
              if (price > 0) {
                this.priceCache.set(token.mint, {
                  price,
                  timestamp: now
                });
              }
            }
          } else if (token.mint === USDC_MINT) {
            price = 1;
            this.priceCache.set(token.mint, {
              price: 1,
              timestamp: now
            });
          }

          priceMap.set(token.mint, price);

          if (onProgress) {
            onProgress({
              current: cachedResults.length + priceMap.size,
              total: tokens.length,
              currentToken: token.symbol
            });
          }
        });

        const fetchedResults = tokensToFetch.map(token => {
          const price = priceMap.get(token.mint) || 0;
          const value = price * token.uiAmount;
          
          return {
            ...token,
            price,
            value
          };
        });

        const allResults = [...cachedResults, ...fetchedResults];
        
        for (const result of fetchedResults) {
          const asset = data.result?.find((a) => a.id === result.mint);
          if (asset) {
            const symbol = asset.content?.metadata?.symbol || result.symbol;
            const name = asset.content?.metadata?.name || result.name;
            const logoURI = asset.content?.links?.image || asset.content?.files?.[0]?.uri || result.logoURI;
            
            result.symbol = symbol;
            result.name = name;
            result.logoURI = logoURI;
          }
        }

        if (onProgress) {
          onProgress({
            current: tokens.length,
            total: tokens.length,
            currentToken: 'complete'
          });
        }
        
        return allResults;
      } else {
        throw new Error('Invalid response from Helius API');
      }
    } catch (error) {
      console.error('failed to fetch prices from Helius:', error);
      return tokens.map(token => ({
        ...token,
        price: 0,
        value: 0
      }));
    }
  }

  async retryFailedTokens(
    failedTokens: TokenBalance[], 
    onProgress?: (progress: PriceProgress) => void
  ): Promise<TokenBalance[]> {
    if (failedTokens.length === 0) {
      return [];
    }
    return await this.getTokenPrices(failedTokens, onProgress);
  }

  getTokenInfo(mintAddress: string): TokenInfo | undefined {
    return this.tokenMap.get(mintAddress);
  }
}