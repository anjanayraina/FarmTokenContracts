import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Search, Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react';

const NFT_ADDRESS = "0x0c06d6a17eb208a9bc7bd698eb6f22379209e3a4";
const MAINNET_RPC = "https://mainnet.infura.io/v3/2aa96ca084c245dab3db38256f7e9c27";

const NFT_ABI = [
  "event Mint(uint256 indexed tokenId)",
  "function MAX_SUPPLY() view returns (uint256)"
];

const UnmintedScanner = ({ onActionComplete }) => {
  const [unmintedIds, setUnmintedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const downloadIds = (ids = unmintedIds) => {
    if (ids.length === 0) return;
    const content = ids.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `unminted_tokens_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const scanForUnminted = async () => {
    setLoading(true);
    setError("");
    setProgress("Connecting to Ethereum Mainnet...");

    try {
      const provider = new ethers.JsonRpcProvider(MAINNET_RPC);
      const nftContract = new ethers.Contract(NFT_ADDRESS, NFT_ABI, provider);

      setProgress("Fetching mint history (this may take a moment)...");

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
      
      // Automatically trigger download
      downloadIds(available);
      
    } catch (err) {
      console.error(err);
      setError("Failed to scan blockchain: " + (err.reason || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-400" />
            Unminted NFT Scanner
          </h2>
          <p className="text-slate-400 text-sm mt-1">Generate a registry file of EWB IDs not yet minted.</p>
        </div>
        <div className="flex items-center gap-3">
          {unmintedIds.length > 0 && !loading && (
            <button
              onClick={() => downloadIds()}
              className="p-2 text-blue-400 hover:text-white transition-colors bg-blue-400/10 rounded-lg border border-blue-400/20"
              title="Re-download Registry"
            >
              <Download className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={scanForUnminted}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg font-bold transition-all flex items-center gap-2 shadow-lg shadow-blue-600/20"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Scanning...' : unmintedIds.length > 0 ? "Rescan" : "Start Scan"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="mt-6 py-6 border-t border-slate-800 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" />
          <p className="text-sm font-medium">{progress}</p>
        </div>
      )}

      {!loading && unmintedIds.length > 0 && (
        <div className="mt-6 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center justify-between">
          <p className="text-emerald-400 text-sm font-medium">
            Scan Complete: Found <strong>{unmintedIds.length}</strong> available IDs. 
            <span className="block text-slate-500 text-xs mt-0.5">Registry file has been generated and downloaded.</span>
          </p>
          <CheckCircle2 className="text-emerald-500 w-5 h-5" />
        </div>
      )}

      {/* Initial standby state */}
      {!loading && unmintedIds.length === 0 && !error && (
        <div className="mt-6 py-12 border-2 border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-slate-500">
          <Search className="w-12 h-12 mb-4 opacity-20" />
          <p className="text-sm">Click "Start Scan" to identify unminted assets</p>
        </div>
      )}
    </div>
  );
};

export default UnmintedScanner;
