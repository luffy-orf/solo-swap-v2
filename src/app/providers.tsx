'use client';

import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { 
  PhantomWalletAdapter, 
  SolflareWalletAdapter,
  LedgerWalletAdapter 
} from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';
import { ThemeProvider } from 'next-themes';
import { ReactNode, useMemo } from 'react';

import '@solana/wallet-adapter-react-ui/styles.css';

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => {
    return process.env.NEXT_PUBLIC_RPC_ENDPOINT_1 || 
           process.env.NEXT_PUBLIC_RPC_ENDPOINT_2 ||
           'https://api.mainnet-beta.solana.com'; 
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new LedgerWalletAdapter(),
    ],
    []
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <style jsx global>{`
              .wallet-adapter-modal-wrapper {
                z-index: 10000 !important;
              }
              
              .wallet-adapter-modal {
                z-index: 10001 !important;
              }
              
              .wallet-adapter-modal-overlay {
                z-index: 9999 !important;
                background-color: rgba(0, 0, 0, 0.8) !important;
                backdrop-filter: blur(8px);
              }
              
              .wallet-adapter-dropdown {
                z-index: 10050 !important;
              }
              
              .wallet-adapter-dropdown-list {
                z-index: 10051 !important;
                background: rgb(31, 41, 55) !important;
                border: 1px solid rgb(55, 65, 81) !important;
                border-radius: 0.75rem !important;
                backdrop-filter: blur(8px) !important;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
              }
              
              .wallet-adapter-dropdown-list-item {
                font-size: 0.875rem !important;
                padding: 0.75rem 1rem !important;
                min-height: 44px !important;
                display: flex !important;
                align-items: center !important;
                transition: all 0.2s ease !important;
                text-transform: lowercase !important;
              }
              
              /* Keep wallet address normal case */
              .wallet-adapter-button-trigger {
                text-transform: none !important;
              }
              
              .wallet-adapter-modal-wrapper .wallet-adapter-modal-title,
              .wallet-adapter-modal-wrapper .wallet-adapter-modal-list li,
              .wallet-adapter-modal-wrapper .wallet-adapter-modal-list-more {
                text-transform: lowercase !important;
              }
              
              /* But keep the wallet address in the button normal */
              .wallet-adapter-modal-wrapper .wallet-adapter-button,
              .wallet-adapter-button[data-connected="true"] {
                text-transform: none !important;
              }
              
              .wallet-adapter-button[data-connected="true"] span {
                text-transform: none !important;
                font-family: monospace !important;
              }
              
              .wallet-adapter-modal-list .wallet-adapter-modal-button span {
                text-transform: lowercase !important;
              }
              
              .wallet-adapter-button-trigger span:not(:first-child) {
                text-transform: none !important;
                font-family: monospace !important;
              }
              
              .wallet-adapter-dropdown-list-item:not([disabled]):hover {
                background-color: rgba(139, 92, 246, 0.2) !important;
                transform: translateX(2px) !important;
              }
              
              .wallet-adapter-button {
                border-radius: 0.75rem !important;
                font-size: 0.875rem !important;
                min-height: 44px !important;
                padding: 0.5rem 1rem !important;
                transition: all 0.2s ease !important;
              }
              
              .wallet-adapter-button:not([disabled]):hover {
                transform: scale(1.02) !important;
              }
              
              /* Mobile optimizations */
              @media (max-width: 768px) {
                .wallet-adapter-modal {
                  margin: 1rem !important;
                  max-height: calc(100vh - 2rem) !important;
                }
                
                .wallet-adapter-modal-title {
                  font-size: 1.125rem !important;
                  padding: 1rem 1.5rem 0.5rem !important;
                }
                
                .wallet-adapter-modal-list {
                  margin: 0 !important;
                  padding: 0.5rem !important;
                }
                
                .wallet-adapter-modal-list-more {
                  font-size: 0.875rem !important;
                  padding: 1rem 1.5rem !important;
                }
              }
              
              .wallet-adapter-dropdown-list {
                z-index: 10050 !important;
                position: fixed !important;
              }
              
              @media (max-width: 768px) {
                .wallet-adapter-dropdown {
                  position: relative !important;
                }
                
                .wallet-adapter-dropdown-list {
                  position: absolute !important;
                  right: 0 !important;
                  top: 100% !important;
                  margin-top: 0.5rem !important;
                  min-width: 160px !important;
                }
              }
              
              .wallet-adapter-modal-button {
                min-height: 60px !important;
                padding: 1rem !important;
              }
              
              @media (max-width: 768px) {
                .wallet-adapter-modal-button {
                  min-height: 56px !important;
                  padding: 0.875rem !important;
                }
                
                .wallet-adapter-modal-button-icon {
                  width: 28px !important;
                  height: 28px !important;
                }
              }
            `}</style>
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </ThemeProvider>
  );
}