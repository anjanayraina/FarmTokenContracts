"use client";

import { useReadContract } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { ShieldAlert, TrendingUp, Key, History, ActivitySquare } from 'lucide-react';
import { formatEther } from 'viem';

// Ensure NEXT_PUBLIC_ORACLE_ADDRESS is populated in your env.
const ORACLE_ADDRESS = (process.env.NEXT_PUBLIC_ORACLE_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`;

const oracleABI = [
    { inputs: [], name: 'currentNAV', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'isStale', outputs: [{ internalType: 'bool', name: '', type: 'bool' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'lastUpdateTimestamp', outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }
];

export default function Dashboard() {
    const { data: navData, isError: navError, isLoading: navLoading } = useReadContract({
        address: ORACLE_ADDRESS,
        abi: oracleABI,
        functionName: 'currentNAV',
        chainId: sepolia.id,
    });

    const { data: isStale, isLoading: staleLoading } = useReadContract({
        address: ORACLE_ADDRESS,
        abi: oracleABI,
        functionName: 'isStale',
        chainId: sepolia.id,
    });

    const { data: lastUpdate } = useReadContract({
        address: ORACLE_ADDRESS,
        abi: oracleABI,
        functionName: 'lastUpdateTimestamp',
        chainId: sepolia.id,
    });

    const formattedNAV = navData ? parseFloat(formatEther(navData as bigint)).toFixed(2) : "0.00";
    const formattedDate = lastUpdate && Number(lastUpdate) > 0 ? new Date(Number(lastUpdate) * 1000).toLocaleString() : "Unknown";

    return (
        <main className="flex min-h-screen flex-col items-center p-8 md:p-24 font-sans max-w-7xl mx-auto">
            <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex mb-16">
                <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-800 bg-black/50 backdrop-blur-md pb-6 pt-8 lg:static lg:w-auto lg:rounded-xl lg:border lg:bg-gray-900/50 lg:p-4 text-cyan-400">
                    <ActivitySquare className="mr-2" /> FARM RWA Protocol
                </p>
            </div>

            <div className="relative flex place-items-center mb-16">
                <h1 className="text-5xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 text-center tracking-tight drop-shadow-lg">
                    Treasury Dashboard
                </h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-5xl mb-16">

                {/* Live NAV Card */}
                <div className="group rounded-3xl border border-gray-800 bg-gray-900/30 p-8 shadow-2xl backdrop-blur-sm transition-all hover:border-cyan-500/50 hover:bg-gray-900/50">
                    <h2 className="mb-4 text-xl font-semibold flex items-center text-gray-300">
                        <TrendingUp className="mr-3 text-emerald-400" />
                        Live NAV Price
                    </h2>
                    <div className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-300 to-cyan-300">
                        {navLoading ? 'Loading...' : `$${formattedNAV}`}
                    </div>
                    <p className="mt-4 text-sm text-gray-500 font-mono">
                        Value of 1 FARMToken
                    </p>
                </div>

                {/* Oracle Status Card */}
                <div className={`group rounded-3xl border p-8 shadow-2xl backdrop-blur-sm transition-all ${isStale ? 'border-red-900/50 bg-red-950/20 hover:border-red-500/50 hover:bg-red-900/30' : 'border-gray-800 bg-gray-900/30 hover:border-emerald-500/50 hover:bg-gray-900/50'}`}>
                    <h2 className="mb-4 text-xl font-semibold flex items-center text-gray-300">
                        <ShieldAlert className={`mr-3 ${isStale ? 'text-red-500' : 'text-emerald-500'}`} />
                        Oracle Heartbeat
                    </h2>
                    <div className={`text-2xl font-bold ${isStale ? 'text-red-400' : 'text-emerald-400'}`}>
                        {staleLoading ? 'Checking...' : (isStale ? 'WARNING: STALE' : 'HEALTHY')}
                    </div>
                    <p className="mt-4 text-sm text-gray-400 font-mono">
                        Last updated: {formattedDate}
                    </p>
                </div>

                {/* Investor Treasury Holdings */}
                <div className="group rounded-3xl border border-gray-800 bg-gray-900/30 p-8 shadow-2xl backdrop-blur-sm transition-all hover:border-cyan-500/50 hover:bg-gray-900/50">
                    <h2 className="mb-4 text-xl font-semibold flex items-center text-gray-300">
                        <Key className="mr-3 text-cyan-400" />
                        Treasury Assets
                    </h2>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center border-b border-gray-800 pb-2 hover:bg-gray-800/20 transition-colors p-2 rounded">
                            <span className="text-gray-400">F-NFT Assets Held</span>
                            <span className="font-mono text-cyan-300 font-semibold">10 units</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 hover:bg-gray-800/20 transition-colors p-2 rounded">
                            <span className="text-gray-400">Yield Generating</span>
                            <span className="font-mono text-emerald-300 font-semibold">Active</span>
                        </div>
                    </div>
                </div>

            </div>

            <div className="w-full max-w-5xl mt-8 text-center bg-gray-900/10 p-4 rounded-2xl border border-gray-800/50 hover:bg-gray-900/30 transition-colors">
                <a
                    href={`https://sepolia.etherscan.io/address/${ORACLE_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-gray-400 hover:text-cyan-400 transition-colors font-medium tracking-wide"
                >
                    <History className="mr-2 h-5 w-5" />
                    View Historical NAV Updates on Etherscan
                </a>
            </div>
        </main>
    );
}
