'use client';

import dynamic from 'next/dynamic';

const WalletMultiButtonDynamic = dynamic(
  async () => 
    (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export function WalletMultiButtonWrapper({ className }: { className?: string }) {
  return <WalletMultiButtonDynamic className={className} />;
}