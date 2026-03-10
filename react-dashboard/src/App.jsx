import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { Wallet, Signal, CheckCircle2, AlertCircle, RefreshCw, Layers, Clock, TrendingUp, Vault } from 'lucide-react';
import './index.css';

const VAULT_ABI = [
  "function totalStaked() view returns (uint256)",
  "function pendingAccumulatedReward() view returns (uint256)",
  "function rewardRatePerHour() view returns (uint256)",
  "function lastClaimTimestamp() view returns (uint256)",
  "function claimRewards() external"
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)"
];

function App() {
  const [vaultAddress, setVaultAddress] = useState("");
  const [pytAddress, setPytAddress] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Contract instance references
  const providerRef = useRef(null);
  const signerRef = useRef(null);
  const vaultRef = useRef(null);
  const pytRef = useRef(null);

  // Blockchain State
  const [chainData, setChainData] = useState({
    totalStaked: 0n,
    pendingReward: 0n,
    rewardRate: 0n,
    lastClaimTime: 0n,
    poolBal: 0n,
  });

  // Ticker state strictly for the UI
  const [livePending, setLivePending] = useState("0.00000");

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        await browserProvider.send("eth_requestAccounts", []);
        const signer = await browserProvider.getSigner();
        const address = await signer.getAddress();

        signerRef.current = signer;
        setWalletAddress(address);

        // Re-bind vault contract if already active
        if (vaultRef.current) {
          vaultRef.current = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      alert("No valid Web3 provider found. Read-only dashboard will still function.");
    }
  };

  const startSync = async () => {
    setErrorMsg("");

    if (!ethers.isAddress(vaultAddress) || !ethers.isAddress(pytAddress)) {
      setErrorMsg("Please provide accurate EVM addresses for local Anvil contracts.");
      return;
    }

    setIsSyncing(true);
    try {
      // Connect specifically to local network fork
      const localProvider = new ethers.JsonRpcProvider("http://localhost:8545");
      await localProvider.getBlockNumber(); // Test connection
      providerRef.current = localProvider;

      const activeRunner = signerRef.current ? signerRef.current : localProvider;

      vaultRef.current = new ethers.Contract(vaultAddress, VAULT_ABI, activeRunner);
      pytRef.current = new ethers.Contract(pytAddress, ERC20_ABI, localProvider); // Only reading for strictly reserves

      setIsConnected(true);
      await fetchBlockchainData();
    } catch (err) {
      console.error(err);
      setErrorMsg("Connection failed. Is your local Anvil node heavily running on port 8545?");
    }
    setIsSyncing(false);
  };

  const fetchBlockchainData = async () => {
    if (!vaultRef.current || !pytRef.current) return;

    try {
      const [totalStaked, pending, rate, lastClaimTime, poolBal] = await Promise.all([
        vaultRef.current.totalStaked(),
        vaultRef.current.pendingAccumulatedReward(),
        vaultRef.current.rewardRatePerHour(),
        vaultRef.current.lastClaimTimestamp(),
        pytRef.current.balanceOf(vaultAddress)
      ]);

      setChainData({ totalStaked, pendingReward: pending, rewardRate: rate, lastClaimTime, poolBal });
      setLivePending(ethers.formatEther(pending));

    } catch (e) {
      console.error("Fetch Data Error:", e);
      setErrorMsg("Contract interaction error. Verify addresses are deployed precisely there.");
    }
  };

  const handleClaim = async () => {
    if (!vaultRef.current || !signerRef.current) return;
    setIsClaiming(true);
    try {
      const tx = await vaultRef.current.claimRewards();
      await tx.wait();
      await fetchBlockchainData();
    } catch (e) {
      console.error(e);
      alert("Transaction failed! Review Anvil logs.");
    }
    setIsClaiming(false);
  };

  // Dedicated ticker loop
  useEffect(() => {
    let interval;
    if (isConnected && chainData.totalStaked > 0n && chainData.rewardRate > 0n) {
      interval = setInterval(() => {
        const nowUnix = BigInt(Math.floor(Date.now() / 1000));
        const secondsPassed = nowUnix - chainData.lastClaimTime;

        // Exact formula matching Vault's math: totalStaked * hoursPassed * ratePerHour
        const accrued = (chainData.totalStaked * secondsPassed * chainData.rewardRate) / 3600n;
        const totalLivePending = chainData.pendingReward + accrued;

        setLivePending(parseFloat(ethers.formatEther(totalLivePending)).toFixed(5));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected, chainData]);

  // Periodic chain sync
  useEffect(() => {
    let interval;
    if (isConnected) {
      interval = setInterval(() => fetchBlockchainData(), 15000);
    }
    return () => clearInterval(interval);
  }, [isConnected]);

  return (
    <>
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div className="status-dot"></div>
          <h2 style={{ letterSpacing: '2px', fontWeight: 800 }}>Treasury <span className="gradient-text">Node</span></h2>
        </div>

        {walletAddress ? (
          <div className="connection-badge">
            <CheckCircle2 size={18} />
            {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)} Connected
          </div>
        ) : (
          <button className="btn-primary" onClick={connectWallet} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Connect Hardware Auth</span>
            <Wallet size={18} style={{ zIndex: 1, position: 'relative' }} />
          </button>
        )}
      </header>

      <main className="main-content">
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h1 style={{ fontSize: '3.5rem', fontWeight: 800, lineHeight: 1.1 }}>
            Enterprise <br />
            <span className="gradient-text">Yield Management</span>
          </h1>
          <p style={{ color: 'var(--text-dim)', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
            Real-time read-only oversight mapped natively to your internal EVM environment. Ensure high-stakes operations are tracked securely offline.
          </p>
        </div>

        {/* Configuration Setup */}
        <div className="glass-panel setup-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Signal className="gradient-text" size={24} />
            <h2 style={{ fontSize: '1.4rem', fontWeight: 600 }}>Local Network Binding</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            <div className="input-group">
              <label>Private Vault Contract</label>
              <input
                type="text"
                placeholder="0x..."
                value={vaultAddress}
                onChange={(e) => setVaultAddress(e.target.value)}
                disabled={isConnected}
              />
            </div>

            <div className="input-group">
              <label>PYT Reward Asset</label>
              <input
                type="text"
                placeholder="0x..."
                value={pytAddress}
                onChange={(e) => setPytAddress(e.target.value)}
                disabled={isConnected}
              />
            </div>
          </div>

          {!isConnected ? (
            <button className="btn-primary" onClick={startSync} disabled={isSyncing} style={{ alignSelf: 'flex-start', marginTop: '10px' }}>
              <span>{isSyncing ? 'Binding...' : 'Initialize Secure Sync'}</span>
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-green)', fontWeight: 600 }}>
              <CheckCircle2 size={18} /> Network Bond Established
              <button onClick={fetchBlockchainData} style={{ background: 'transparent', color: 'var(--text-dim)', marginLeft: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <RefreshCw size={14} /> Force Poll
              </button>
            </div>
          )}

          {errorMsg && (
            <div style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', marginTop: '10px' }}>
              <AlertCircle size={18} /> {errorMsg}
            </div>
          )}
        </div>

        {/* Display Statistics */}
        <div className="dashboard-grid">

          {/* Static Mandate - Portfolio Value */}
          <div className="glass-panel stat-card card-hover">
            <div className="stat-title"><Vault size={18} /> Portfolio Valuation</div>
            <div className="stat-value mono">$112M <span className="unit">USD</span></div>
            <div className="stat-desc">Hardcoded compliance target defined via corporate mandate.</div>
          </div>

          {/* Locked Assets */}
          <div className="glass-panel stat-card card-hover">
            <div className="stat-title"><Layers size={18} /> Locked NFT Inventory</div>
            <div className="stat-value mono">
              {isConnected ? chainData.totalStaked.toString() : '--'}
              <span className="unit">STAKED</span>
            </div>
            <div className="stat-desc">Provably secure within vault architecture.</div>
          </div>

          {/* Pending Ticker */}
          <div className="glass-panel stat-card card-hover" style={{ borderColor: 'rgba(0, 240, 255, 0.2)' }}>
            <div className="stat-title gradient-text"><TrendingUp size={18} /> Live Pending Yield</div>
            <div className="stat-value mono" style={{ color: 'var(--accent-cyan)', textShadow: '0 0 15px rgba(0, 240, 255, 0.3)' }}>
              {isConnected ? livePending : '--'}
              <span className="unit" style={{ color: 'var(--accent-cyan)' }}>PYT</span>
            </div>
            <div className="stat-desc">Accumulating dynamically via offline contract emission math.</div>
          </div>

          {/* Vault Balance */}
          <div className="glass-panel stat-card card-hover">
            <div className="stat-title"><RefreshCw size={18} /> Treasury Liquidity</div>
            <div className="stat-value mono">
              {isConnected ? parseFloat(ethers.formatEther(chainData.poolBal)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}
              <span className="unit">PYT</span>
            </div>
            <div className="stat-desc">Available tokens awaiting distribution routing.</div>
          </div>

        </div>

        {/* Action Bottom */}
        {isConnected && (
          <div className="action-bar">
            <button
              className="btn-primary"
              disabled={!walletAddress || isClaiming || chainData.pendingReward === 0n}
              onClick={handleClaim}
              style={{ borderRadius: '50px' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
                {isClaiming ? <RefreshCw size={20} className="spin" /> : <Clock size={20} />}
                {isClaiming ? 'Executing Blockchain Call...' : 'Claim Authorized Offline Rewards'}
              </span>
            </button>
            {!walletAddress && <div style={{ marginLeft: '20px', color: 'var(--text-dim)', alignSelf: 'center' }}>Authentication restricted. Connect signer.</div>}
          </div>
        )}

      </main>
    </>
  );
}

export default App;
