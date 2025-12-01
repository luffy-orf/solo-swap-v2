'use client';

import { TokenSafetyInfo, SafetyLevel } from '../types/tokenSafety';
import { Shield, AlertTriangle, HelpCircle, CheckCircle, XCircle } from 'lucide-react';

interface TokenSafetyBadgeProps {
    safetyInfo?: TokenSafetyInfo;
    size?: 'sm' | 'md' | 'lg';
    showTooltip?: boolean;
}

export function TokenSafetyBadge({
    safetyInfo,
    size = 'sm',
    showTooltip = true
}: TokenSafetyBadgeProps) {
    if (!safetyInfo) {
        return null;
    }

    const { level, score, risks, source } = safetyInfo;

    const config = getSafetyConfig(level);
    const Icon = config.icon;
    const sizeClass = size === 'sm' ? 'h-4 w-4' : size === 'md' ? 'h-5 w-5' : 'h-6 w-6';

    return (
        <div className="relative group inline-block">
            {/* Badge Icon */}
            <div className={`${config.bgClass} ${config.textClass} rounded-full p-1.5 inline-flex items-center justify-center`}>
                <Icon className={sizeClass} />
            </div>

            {/* Tooltip on hover */}
            {showTooltip && (
                <div className="absolute left-0 top-full mt-2 w-64 p-3 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
                    <div className="flex items-center space-x-2 mb-2">
                        <Icon className={`h-5 w-5 ${config.textClass}`} />
                        <span className="font-semibold text-white">{config.label}</span>
                    </div>

                    {score !== undefined && (
                        <div className="mb-2">
                            <div className="text-xs text-gray-400 mb-1">Safety Score</div>
                            <div className="flex items-center">
                                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${config.barClass}`}
                                        style={{ width: `${(score / 10000) * 100}%` }}
                                    />
                                </div>
                                <span className="ml-2 text-xs font-mono text-gray-300">
                                    {(score / 100).toFixed(0)}%
                                </span>
                            </div>
                        </div>
                    )}

                    {risks.length > 0 && (
                        <div className="mt-2">
                            <div className="text-xs text-gray-400 mb-1">Risk Factors:</div>
                            <ul className="text-xs text-gray-300 space-y-1">
                                {risks.slice(0, 3).map((risk, i) => (
                                    <li key={i} className="flex items-start">
                                        <span className="text-gray-500 mr-1">•</span>
                                        <span>{risk}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="mt-2 text-xs text-gray-500">
                        Source: {source}
                    </div>
                </div>
            )}
        </div>
    );
}

function getSafetyConfig(level: SafetyLevel) {
    switch (level) {
        case SafetyLevel.VERIFIED:
            return {
                icon: CheckCircle,
                label: 'Verified Safe',
                bgClass: 'bg-green-500/20',
                textClass: 'text-green-400',
                barClass: 'bg-green-500',
            };
        case SafetyLevel.GOOD:
            return {
                icon: Shield,
                label: 'Low Risk',
                bgClass: 'bg-green-500/20',
                textClass: 'text-green-400',
                barClass: 'bg-green-500',
            };
        case SafetyLevel.UNKNOWN:
            return {
                icon: HelpCircle,
                label: 'Unknown',
                bgClass: 'bg-yellow-500/20',
                textClass: 'text-yellow-400',
                barClass: 'bg-yellow-500',
            };
        case SafetyLevel.WARNING:
            return {
                icon: AlertTriangle,
                label: 'Moderate Risk',
                bgClass: 'bg-orange-500/20',
                textClass: 'text-orange-400',
                barClass: 'bg-orange-500',
            };
        case SafetyLevel.DANGER:
            return {
                icon: XCircle,
                label: 'High Risk',
                bgClass: 'bg-red-500/20',
                textClass: 'text-red-400',
                barClass: 'bg-red-500',
            };
    }
}
