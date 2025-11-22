import { Connection, PublicKey } from '@solana/web3.js';
import { TokenBalance, TokenInfo, PriceProgress } from '../types/token';

const JUPITER_LITE_API = 'https://lite-api.jup.ag';
const RPC_ENDPOINTS = [
  process.env.NEXT_PUBLIC_RPC_ENDPOINT_1,
  process.env.NEXT_PUBLIC_RPC_ENDPOINT_2,
].filter(Boolean) as string[]; 

const FALLBACK_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com'
];

class RateLimiter {
  private lastRequestTime = 0;
  private minInterval = 1100;

  async wait(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minInterval - timeSinceLastRequest)
      );
    }
    
    this.lastRequestTime = Date.now();
  }
}

class LoadBalancer {
  private rpcLimiters: Map<string, RateLimiter> = new Map();
  private currentIndex = 0;

  constructor(private endpoints: string[]) {
    if (endpoints.length === 0) {
      this.endpoints = FALLBACK_RPC_ENDPOINTS;
      console.warn('using fallback rpc endpoints. please configure RPC_ENDPOINT environment variables for better performance.');
    }
    
    this.endpoints.forEach(endpoint => {
      this.rpcLimiters.set(endpoint, new RateLimiter());
    });
    
    console.log(`loadbalancer initialized with ${this.endpoints.length} endpoints`);
  }

  async getNextEndpoint(): Promise<{ endpoint: string; limiter: RateLimiter }> {
    const endpoint = this.endpoints[this.currentIndex];
    const limiter = this.rpcLimiters.get(endpoint)!;
    
    this.currentIndex = (this.currentIndex + 1) % this.endpoints.length;
    await limiter.wait();
    
    return { endpoint, limiter };
  }

  async executeWithRetry<T>(
    operation: (endpoint: string) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { endpoint } = await this.getNextEndpoint();
      
      try {
        console.log(`attempt ${attempt + 1} with ${this.getEndpointName(endpoint)}`);
        const result = await operation(endpoint);
        console.log(`success with ${this.getEndpointName(endpoint)}`);
        return result;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'unknown error occurred';
        lastError = new Error(errorMessage);
        console.warn(`attempt ${attempt + 1} failed with ${this.getEndpointName(endpoint)}:`, errorMessage);
        
        if (errorMessage.includes('403') || errorMessage.includes('429') || errorMessage.includes('401')) {
          console.log(`skipping ${this.getEndpointName(endpoint)} due to auth/rate limit`);
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
const jupiterLimiter = new RateLimiter();

export class TokenService {
  private tokenMap: Map<string, TokenInfo> = new Map();
  private tokenListLoaded: boolean = false;

  constructor() {
    this.loadTokenList();
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
        
        console.log(`loaded ${tokens.length} tokens`);
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
    console.log('using fallback token list');
  }

  async ensureTokenListLoaded(): Promise<void> {
    if (!this.tokenListLoaded) {
      await this.loadTokenList();
    }
  }

  async getTokenBalances(walletAddress: string): Promise<TokenBalance[]> {
    await this.ensureTokenListLoaded();
    
    console.log('fetching token balances for:', walletAddress);

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

      console.log(`found ${tokenAccounts.value.length} token accounts and ${solBalance} lamports sol`);

      const tokens: TokenBalance[] = [];

      // Add native SOL balance
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

      for (const account of tokenAccounts.value) {
        try {
          const accountInfo = account.account.data.parsed.info;
          const mint = accountInfo.mint;
          const tokenAmount = accountInfo.tokenAmount;
          
          if (tokenAmount.uiAmount > 0) {
            const tokenInfo = this.tokenMap.get(mint);
            
            tokens.push({
              mint: mint,
              symbol: tokenInfo?.symbol || 'UNKNOWN',
              name: tokenInfo?.name || 'Unknown Token',
              balance: Number(tokenAmount.amount),
              decimals: tokenAmount.decimals,
              uiAmount: tokenAmount.uiAmount,
              price: 0,
              value: 0,
              selected: false,
              logoURI: tokenInfo?.logoURI || null
            });
          }
        } catch (error) {
          console.warn('error processing token account:', error);
        }
      }

      console.log(`processed ${tokens.length} tokens with balance`);
      return tokens;
    });
  }

  async getTokenPrices(
    tokens: TokenBalance[], 
    onProgress?: (progress: PriceProgress) => void
  ): Promise<TokenBalance[]> {
    console.log(`fetching prices for ${tokens.length} tokens...`);
    
    const results: TokenBalance[] = [];
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: tokens.length,
          currentToken: token.symbol
        });
      }
      
      try {
        if (token.mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') {
          results.push({
            ...token,
            price: 1,
            value: token.uiAmount
          });
          console.log(`✅ USDC: ${token.uiAmount} → $${token.uiAmount.toFixed(6)} ($1.00/token)`);
          continue;
        }

        await jupiterLimiter.wait();
        
        const rawAmount = Math.max(
          Math.floor(token.uiAmount * Math.pow(10, token.decimals)),
          1000
        );

        const url = `${JUPITER_LITE_API}/swap/v1/quote?inputMint=${token.mint}&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=${rawAmount}`;
        
        console.log(`🔍 Getting quote for ${token.symbol}: ${token.uiAmount} (raw: ${rawAmount})`);
        
        const response = await fetch(url);

        if (!response.ok) {
          if (response.status === 400) {
            console.log(`${token.symbol} is not tradable`);
            results.push({ ...token, value: 0, price: 0 });
            continue;
          }
          throw new Error(`http ${response.status}`);
        }

        const quoteData = await response.json();
        
        if (!quoteData?.outAmount) {
          console.log(`no quote data for ${token.symbol}`);
          results.push({ ...token, value: 0, price: 0 });
          continue;
        }

        const usdcValue = parseInt(quoteData.outAmount) / 1_000_000;
        const price = token.uiAmount > 0 ? usdcValue / token.uiAmount : 0;
        const value = usdcValue;

        console.log(`✅ ${token.symbol}: ${token.uiAmount} → $${value.toFixed(6)} ($${price.toFixed(6)}/token)`);
        
        results.push({
          ...token,
          value,
          price,
        });
        
      } catch (error) {
        console.error(`failed to get price for ${token.symbol}:`, error);
        results.push({ ...token, value: 0, price: 0 });
        
        if (error instanceof Error && error.message.includes('429')) {
          console.log('rate limited, waiting 2 secs...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (i < tokens.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    if (onProgress) {
      onProgress({
        current: tokens.length,
        total: tokens.length,
        currentToken: 'complete'
      });
    }

    const successfulTokens = results.filter(token => token.value > 0);
    
    console.log(`final results: ${successfulTokens.length} priced, ${results.length - successfulTokens.length} failed`);
    
    return results;
  }

  async retryFailedTokens(
    failedTokens: TokenBalance[], 
    onProgress?: (progress: PriceProgress) => void
  ): Promise<TokenBalance[]> {
    if (failedTokens.length === 0) {
      return [];
    }

    console.log(`🔄 Retrying ${failedTokens.length} failed tokens...`);
    return await this.getTokenPrices(failedTokens, onProgress);
  }

  getTokenInfo(mintAddress: string): TokenInfo | undefined {
    return this.tokenMap.get(mintAddress);
  }
}