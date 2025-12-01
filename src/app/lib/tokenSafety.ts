import { SafetyLevel, TokenSafetyInfo } from '../types/tokenSafety';

const GOPLUS_API = 'https://api.gopluslabs.io/api/v1/solana/token_security';
const SAFETY_ENABLED = typeof window !== 'undefined' &&
    (process.env.NEXT_PUBLIC_ENABLE_SAFETY_CHECKS === 'true');

// Cache to avoid repeated API calls (localStorage)
const SAFETY_CACHE_KEY = 'token_safety_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface SafetyCache {
    [mint: string]: {
        data: TokenSafetyInfo;
        timestamp: number;
    };
}

class TokenSafetyService {
    private cache: SafetyCache = {};

    constructor() {
        if (typeof window !== 'undefined') {
            this.loadCache();
        }
    }

    private loadCache() {
        try {
            const cached = localStorage.getItem(SAFETY_CACHE_KEY);
            if (cached) {
                this.cache = JSON.parse(cached);
                this.cleanExpiredCache();
            }
        } catch (error) {
            // Silently fail
        }
    }

    private saveCache() {
        try {
            localStorage.setItem(SAFETY_CACHE_KEY, JSON.stringify(this.cache));
        } catch (error) {
            // Silently fail
        }
    }

    private cleanExpiredCache() {
        const now = Date.now();
        Object.keys(this.cache).forEach(mint => {
            if (now - this.cache[mint].timestamp > CACHE_DURATION) {
                delete this.cache[mint];
            }
        });
        this.saveCache();
    }

    async fetchSafetyInfo(mint: string): Promise<TokenSafetyInfo> {
        if (!SAFETY_ENABLED) {
            return this.getDefaultSafety(mint);
        }

        // Check cache first
        const cached = this.cache[mint];
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }

        // Fetch from GoPlus
        try {
            const safety = await this.fetchFromGoPlus(mint);
            this.cacheResult(mint, safety);
            return safety;
        } catch (error) {
            return this.getDefaultSafety(mint);
        }
    }

    async fetchSafetyBatch(mints: string[]): Promise<Map<string, TokenSafetyInfo>> {
        const results = new Map<string, TokenSafetyInfo>();

        // Process in batches of 10 to avoid rate limits
        const batchSize = 10;
        for (let i = 0; i < mints.length; i += batchSize) {
            const batch = mints.slice(i, i + batchSize);
            const promises = batch.map(mint => this.fetchSafetyInfo(mint));
            const batchResults = await Promise.allSettled(promises);

            batch.forEach((mint, index) => {
                const result = batchResults[index];
                if (result.status === 'fulfilled') {
                    results.set(mint, result.value);
                } else {
                    results.set(mint, this.getDefaultSafety(mint));
                }
            });

            // Rate limiting delay
            if (i + batchSize < mints.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        return results;
    }

    private async fetchFromGoPlus(mint: string): Promise<TokenSafetyInfo> {
        const response = await fetch(
            `${GOPLUS_API}?contract_addresses=${mint}`
        );

        if (!response.ok) {
            throw new Error(`GoPlus API error: ${response.status}`);
        }

        const data = await response.json();
        return this.parseGoPlusResponse(data, mint);
    }

    private parseGoPlusResponse(data: any, mint: string): TokenSafetyInfo {
        const tokenData = data.result?.[mint];
        if (!tokenData) {
            return this.getDefaultSafety(mint);
        }

        const risks: string[] = [];
        const isMintable = tokenData.is_mintable === '1';
        const isFreezable = tokenData.is_freezable === '1';

        if (isMintable) risks.push('Mint authority active');
        if (isFreezable) risks.push('Freeze authority active');

        // Determine safety level based on risks
        let level: SafetyLevel;
        if (risks.length === 0) {
            level = SafetyLevel.GOOD;
        } else if (risks.length === 1) {
            level = SafetyLevel.WARNING;
        } else {
            level = SafetyLevel.DANGER;
        }

        return {
            level,
            source: 'goplus',
            risks,
            details: {
                mintAuthority: isMintable,
                freezeAuthority: isFreezable,
                holderCount: parseInt(tokenData.holder_count || '0'),
            },
            lastChecked: Date.now(),
        };
    }

    private getDefaultSafety(mint: string): TokenSafetyInfo {
        return {
            level: SafetyLevel.UNKNOWN,
            source: 'unknown',
            risks: ['Unable to verify token safety'],
            lastChecked: Date.now(),
        };
    }

    private cacheResult(mint: string, safety: TokenSafetyInfo) {
        this.cache[mint] = {
            data: safety,
            timestamp: Date.now(),
        };
        this.saveCache();
    }
}

export const tokenSafetyService = new TokenSafetyService();
