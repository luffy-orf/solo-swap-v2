import { useState, useEffect, useRef } from 'react';

interface LoadingBarProps {
  totalItems: number;
  currentProcessed: number;
  itemType?: string;
  durationPerItem?: number;
  className?: string;
  status?: 'analyzing' | 'fetching' | 'processing' | 'complete' | 'idle';
  currentItemName?: string;
  subProgress?: {
    total: number;
    current: number;
    type: string;
  };
}

export function LoadingBar({ 
  totalItems, 
  currentProcessed, 
  itemType = 'tokens',
  durationPerItem = 3000,
  className = '' 
}: LoadingBarProps) {
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const previousProcessedRef = useRef<number>(0);

  useEffect(() => {
    if (totalItems === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(0);
      setTimeRemaining(0);
      return;
    }

    if (!startTimeRef.current || previousProcessedRef.current === 0) {
      console.log('loadingbar initialized - totalitems:', totalItems, 'currentprocessed:', currentProcessed);
      startTimeRef.current = Date.now();
      previousProcessedRef.current = currentProcessed;
    }

    const updateProgress = () => {
      if (!startTimeRef.current) return;

      const currentTime = Date.now();
      const elapsed = currentTime - startTimeRef.current;
      
      const actualProgress = totalItems > 0 ? (currentProcessed / totalItems) * 100 : 0;
      
      const totalDuration = totalItems * durationPerItem;
      const timeBasedProgress = totalDuration > 0 ? Math.min((elapsed / totalDuration) * 100, 100) : 0;
      
      const displayProgress = Math.min(Math.max(actualProgress, timeBasedProgress), 100);
      setProgress(displayProgress);

      if (actualProgress > 0 && actualProgress < 100) {
        const estimatedTotalTime = (elapsed / actualProgress) * 100;
        const remaining = Math.max(0, estimatedTotalTime - elapsed);
        setTimeRemaining(remaining);
      } else {
        setTimeRemaining(0);
      }

      if (displayProgress < 100 && currentProcessed < totalItems) {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      } else {
        if (currentProcessed >= totalItems) {
          setProgress(100);
          setTimeRemaining(0);
        }
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [totalItems, currentProcessed, durationPerItem]);
  useEffect(() => {
    if (currentProcessed !== previousProcessedRef.current) {
      console.log('progress update:', {
        currentProcessed,
        totalItems,
        progress: (currentProcessed / totalItems) * 100
      });
      previousProcessedRef.current = currentProcessed;
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