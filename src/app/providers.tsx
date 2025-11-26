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
import { ReactNode, useMemo, useEffect } from 'react';

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

  useEffect(() => {
    const preserveWalletAddressCase = () => {
      setTimeout(() => {
        const walletButtons = document.querySelectorAll('.wallet-adapter-button');
        walletButtons.forEach(button => {
          const span = button.querySelector('span');
          if (span) {
            const text = span.textContent || '';
            if (text.match(/[0-9a-zA-Z]{32,44}/) || text.includes('...') || text.length > 20) {
              // Type cast to HTMLElement to access style property
              (span as HTMLElement).style.textTransform = 'none';
              (button as HTMLElement).style.textTransform = 'none';
            }
          }
        });
      }, 100);
    };

    preserveWalletAddressCase();
    
    const observer = new MutationObserver(preserveWalletAddressCase);
    observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });

    return () => observer.disconnect();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark">
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <style jsx global>{`
              /* Global lowercase styling for user-facing text */
              .wallet-adapter-button {
                text-transform: lowercase !important;
              }
              
              .wallet-adapter-modal-button span {
                text-transform: lowercase !important;
              }
              
              .wallet-adapter-modal-list-more {
                text-transform: lowercase !important;
              }
            
              .wallet-adapter-dropdown-list-item {
                text-transform: lowercase !important;
              }
                
              .wallet-adapter-modal-title {
                text-transform: lowercase !important;
              }

              /* But preserve wallet addresses and technical text */
              .wallet-address,
              .token-address,
              .mono,
              code,
              pre {
                text-transform: none !important;
              }

              /* Ensure all user-facing button text is lowercase */
              button:not(.wallet-adapter-button):not([class*="mono"]), 
              [role="button"]:not([class*="mono"]) {
                text-transform: lowercase !important;
              }

              /* Mobile text scaling */
              @media (max-width: 767px) {
                body {
                  font-size: 18px !important;
                  line-height: 1.6 !important;
                }
                
                .wallet-adapter-button {
                  font-size: 16px !important;
                  min-height: 48px !important;
                }
                
                .mobile-wallet-button .wallet-adapter-button {
                  font-size: 16px !important;
                  padding: 12px 16px !important;
                }
                
                .wallet-adapter-dropdown-list-item {
                  font-size: 16px !important;
                  padding: 14px 16px !important;
                  min-height: 48px !important;
                }
                
                .wallet-adapter-modal-title {
                  font-size: 20px !important;
                }
                
                .wallet-adapter-modal-button {
                  font-size: 16px !important;
                }
                
                button:not(.wallet-adapter-button) {
                  font-size: 16px !important;
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