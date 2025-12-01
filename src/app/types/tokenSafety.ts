export enum SafetyLevel {
  VERIFIED = 'verified',    // Green - Jupiter verified or low risk
  GOOD = 'good',            // Green - High safety score
  UNKNOWN = 'unknown',      // Yellow - No data or moderate score
  WARNING = 'warning',      // Orange - Moderate risk detected
  DANGER = 'danger',        // Red - High risk detected
}

export interface TokenSafetyInfo {
  level: SafetyLevel;
  score?: number; // 0-10000 scale (RugCheck format)
  source: 'rugcheck' | 'goplus' | 'jupiter' | 'unknown';
  risks: string[]; // Human-readable risk descriptions
  details?: {
    mintAuthority?: boolean;
    freezeAuthority?: boolean;
    liquidityLocked?: boolean;
    holderCount?: number;
    marketCap?: number;
  };
  lastChecked: number; // Unix timestamp
}
