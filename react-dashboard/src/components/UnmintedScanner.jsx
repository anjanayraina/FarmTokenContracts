import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Search, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const NFT_ADDRESS = "0x0c06d6a17eb208a9bc7bd698eb6f22379209e3a4";
const MAINNET_RPC = "https://mainnet.infura.io/v3/2aa96ca084c245dab3db38256f7e9c27";

const NFT_ABI = [
  "event Mint(uint256 indexed tokenId)",
  "function MAX_SUPPLY() view returns (uint256)"
];

const UnmintedScanner = ({ vaultContract, onActionComplete }) => {
  const [unmintedIds, setUnmintedIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [staking, setStaking] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const scanForUnminted = async () => {
    setLoading(true);
    setError("");
    setProgress("Connecting to Ethereum Mainnet...");
    
    try {
      const provider = new ethers.JsonRpcProvider(MAINNET_RPC);
      const nftContract = new ethers.Contract(NFT_ADDRESS, NFT_ABI, provider);

      setProgress("Fetching mint history (this may take a moment)...");
      
      // Fetch all Mint events. 
      // Note: For a collection of 10k items, we should be able to get these logs
      // but some RPCs limit block range. We'll try to get all.
      // EWB was deployed around late 2021.
      const filter = nftContract.filters.Mint();
      const logs = await nftContract.queryFilter(filter);
      
      const mintedSet = new Set();
      logs.forEach(log => {
        mintedSet.add(log.args.tokenId.toString());
      });

      const available = [];
      for (let i = 1; i <= 10000; i++) {
        if (!mintedSet.has(i.toString())) {
          available.push(i);
        }
      }

      setUnmintedIds(available);
      setProgress(`Found ${available.length} unminted IDs.`);
    } catch (err) {
      console.error(err);
      setError("Failed to scan blockchain: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleStakeSelected = async () => {
    if (selectedIds.size === 0 || !vaultContract) return;
    
    setStaking(true);
    setError("");
    try {
      const idsArray = Array.from(selectedIds).map(id => BigInt(id));
      const tx = await vaultContract.batchStakeUnminted(idsArray);
      await tx.wait();
      
      setSelectedIds(new Set());
      if (onActionComplete) onActionComplete();
      alert("Successfully staked unminted IDs!");
    } catch (err) {
      console.error(err);
      setError("Staking failed: " + (err.reason || err.shortMessage || err.message));
    } finally {
      setStaking(false);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-400" />
            Unminted NFT Scanner
          </h2>
          <p className="text-slate-400 text-sm mt-1">Scan for EWB IDs not yet minted on Mainnet</p>
        </div>
        <button 
          onClick={scanForUnminted}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg font-medium transition-all flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {unmintedIds.length > 0 ? "Rescan" : "Start Scan"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-4" />
          <p>{progress}</p>
        </div>
      )}

      {!loading && unmintedIds.length > 0 && (
        <>
          <div className="flex justify-between items-end mb-3">
            <span className="text-sm font-medium text-slate-300">
              {selectedIds.size} IDs selected
            </span>
            <button
               onClick={() => setSelectedIds(new Set())}
               className="text-xs text-slate-500 hover:text-white"
            >
              Clear Selection
            </button>
          </div>
          
          <div className="h-64 overflow-y-auto pr-2 custom-scrollbar bg-slate-950/50 rounded-lg border border-slate-800 p-4 mb-6">
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
              {unmintedIds.map(id => (
                <button
                  key={id}
                  onClick={() => toggleSelection(id)}
                  className={`
                    py-2 rounded text-xs font-mono transition-all border
                    ${selectedIds.has(id) 
                      ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(37,99,235,0.4)]' 
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'}
                  `}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStakeSelected}
            disabled={staking || selectedIds.size === 0}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-800 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {staking ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            Stake {selectedIds.size} Selected IDs
          </button>
        </>
      )}

      {!loading && unmintedIds.length === 0 && !error && (
        <div className="py-12 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500">
          <Search className="w-12 h-12 mb-4 opacity-20" />
          <p>Click "Start Scan" to find unminted NFTs</p>
        </div>
      )}
    </div>
  );
};

export default UnmintedScanner;
