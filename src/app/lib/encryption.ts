import CryptoJS from 'crypto-js';

export class EncryptionService {
  private getEncryptionKey(publicKey: string): string {
    const appSecret = process.env.NEXT_PUBLIC_ENCRYPTION_SECRET || 'fallback-secret';
    return CryptoJS.SHA256(publicKey + appSecret).toString();
  }

  encryptData<T>(data: T, publicKey: string): string {
    const key = this.getEncryptionKey(publicKey);
    const dataString = JSON.stringify(data);
    const encrypted = CryptoJS.AES.encrypt(dataString, key);
    return encrypted.toString();
  }

  decryptData<T>(encryptedData: string, publicKey: string): T | null {
    try {
      const key = this.getEncryptionKey(publicKey);
      const decrypted = CryptoJS.AES.decrypt(encryptedData, key);
      const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedString) {
        throw new Error('Decryption failed - invalid key or data');
      }
      
      return JSON.parse(decryptedString) as T;
    } catch (error) {
      console.error('Decryption error:', error);
      return null;
    }
  }

  encryptPortfolioHistory(historyData: {
    totalValue: number;
    walletCount: number;
    tokenCount: number;
    timestamp: Date;
  }, publicKey: string): string {
    return this.encryptData(historyData, publicKey);
  }

  decryptPortfolioHistory(encryptedData: string, publicKey: string): {
    totalValue: number;
    walletCount: number;
    tokenCount: number;
    timestamp: Date;
  } | null {
    const decrypted = this.decryptData<{
      totalValue?: number;
      walletCount?: number;
      tokenCount?: number;
      timestamp?: string | number | Date;
    }>(encryptedData, publicKey);
    if (!decrypted) return null;

    return {
      totalValue: decrypted.totalValue || 0,
      walletCount: decrypted.walletCount || 0,
      tokenCount: decrypted.tokenCount || 0,
      timestamp: new Date(decrypted.timestamp)
    };
  }

  generateRandomEncrypted(publicKey: string): string {
    const randomData = {
      random: CryptoJS.lib.WordArray.random(32).toString(),
      timestamp: Date.now(),
      value: Math.random() * 1000
    };
    return this.encryptData(randomData, publicKey);
  }
}

export const encryptionService = new EncryptionService();