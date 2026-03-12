import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import UnmintedScanner from './components/UnmintedScanner';
import { Wallet, Layers, TrendingUp, Coins, Activity, CheckCircle2, RefreshCw, Upload } from 'lucide-react';
import './index.css';

const VAULT_ABI = [
  "function totalStaked() view returns (uint256)",
  "function getPendingRewards() view returns (uint256)",
  "function rewardRatePerHour() view returns (uint256)",
  "function lastClaimTimestamp() view returns (uint256)",
  "function claimRewards() external",
  "function batchStake(uint256[] calldata tokenIds) external",
  "function batchStakeUnminted(uint256[] calldata tokenIds) external",
  "function batchUnstake(uint256[] calldata tokenIds) external",
  "function setRewardRate(uint256 newRate) external",
  "function pause() external",
  "function unpause() external",
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "event Staked(uint256[] tokenIds, uint256 timestamp)",
  "event Unstaked(uint256[] tokenIds, uint256 timestamp)"
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)"
];

function App() {
  const [account, setAccount] = useState("");
  const vaultAddress = import.meta.env.VITE_VAULT_ADDRESS || "";
  const pytAddress = import.meta.env.VITE_PYT_ADDRESS || "";
  const rpcUrl = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
  const chainIdInt = parseInt(import.meta.env.VITE_CHAIN_ID || "31337");
  const chainIdHex = "0x" + chainIdInt.toString(16);
  const networkName = import.meta.env.VITE_NETWORK_NAME || "Anvil Localhost";
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);

  const [stats, setStats] = useState({
    staked: "0",
    pending: "0.0",
    vaultReserve: "0.0",
    userBalance: "0.0",
    rewardRate: "0.0",
    isPaused: false,
    stakedIds: []
  });
  const [isClaiming, setIsClaiming] = useState(false);
  const [isStaking, setIsStaking] = useState(false);
  const [stakeIds, setStakeIds] = useState("");
  const [isUnstaking, setIsUnstaking] = useState(false);
  const [unstakeIds, setUnstakeIds] = useState("");
  const [isSettingRate, setIsSettingRate] = useState(false);
  const [newRate, setNewRate] = useState("");
  const [isPausing, setIsPausing] = useState(false);
  const [vaultOwner, setVaultOwner] = useState("");
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [batchStatus, setBatchStatus] = useState({ current: 0, total: 0, active: false });

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
    }
    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    }
  }, [provider]); // Depend on provider

  const handleAccountsChanged = async (accounts) => {
    if (accounts.length > 0) {
      setAccount(accounts[0]);
      if (provider) {
        try {
          const newSigner = await provider.getSigner();
          setSigner(newSigner);
        } catch (e) {
          // ignore
        }
      }
    } else {
      setAccount("");
      setSigner(null);
      setProvider(null);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("Please install MetaMask!");
      return;
    }
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      setProvider(browserProvider);

      const accounts = await browserProvider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);

      // Request network switch dynamically
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: chainIdHex,
                  chainName: networkName,
                  rpcUrls: [rpcUrl],
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                },
              ],
            });
          } catch (addError) {
            console.error("Failed to add local network to MetaMask", addError);
          }
        } else {
          // ignore switch failure
        }
      }

      const activeSigner = await browserProvider.getSigner();
      setSigner(activeSigner);
      setError("");
    } catch (err) {
      setError("Failed to connect wallet. Please try again.");
    }
  };

  const fetchStats = async () => {
    if (!ethers.isAddress(vaultAddress) || !ethers.isAddress(pytAddress)) return;
    setIsRefreshing(true);
    try {
      // Always use node config for reliable read data regardless of Metamask state
      const localProvider = new ethers.JsonRpcProvider(rpcUrl);
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, localProvider);
      const pyt = new ethers.Contract(pytAddress, ERC20_ABI, localProvider);

      // Force Anvil to mine a transparent block locally to advance the `block.timestamp` 
      // otherwise view functions return frozen time between active transactions.
      if (rpcUrl.includes('127.0.0.1') || rpcUrl.includes('localhost')) {
        try { await localProvider.send("evm_mine", []); } catch (e) { /* ignore production */ }
      }

      const [staked, pending, vaultBal, ownerAddr, rateWei, pausedStatus] = await Promise.all([
        vault.totalStaked(),
        vault.getPendingRewards(),
        pyt.balanceOf(vaultAddress),
        vault.owner(),
        vault.rewardRatePerHour(),
        vault.paused()
      ]);

      setVaultOwner(ownerAddr);

      let userBal = 0n;
      if (account) {
        userBal = await pyt.balanceOf(account);
      }

      // Calculate the specific explicitly Staked IDs from Events
      const stakedLogs = await vault.queryFilter(vault.filters.Staked(), -10000);
      const unstakedLogs = await vault.queryFilter(vault.filters.Unstaked(), -10000);

      const activeIds = new Set();
      stakedLogs.forEach(log => {
        log.args[0].forEach(id => activeIds.add(id.toString()));
      });
      unstakedLogs.forEach(log => {
        log.args[0].forEach(id => activeIds.delete(id.toString()));
      });
      const currentStakedIds = Array.from(activeIds).sort((a, b) => Number(a) - Number(b));

      setStats({
        staked: staked.toString(),
        pending: ethers.formatEther(pending),
        vaultReserve: ethers.formatEther(vaultBal),
        userBalance: ethers.formatEther(userBal),
        rewardRate: ethers.formatEther(rateWei),
        isPaused: pausedStatus,
        stakedIds: currentStakedIds
      });
      setError("");
    } catch (err) {
      console.error("fetchStats Error:", err);
      setError(`Fetch Failed: ${err.message || err.toString()}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Poll for updates every 5 seconds (Runs even without Metamask to show dashboard)
  useEffect(() => {
    if (vaultAddress && pytAddress) {
      fetchStats();
      const interval = setInterval(fetchStats, 5000);
      return () => clearInterval(interval);
    }
  }, [account, vaultAddress, pytAddress]);

  const handleClaim = async () => {
    if (!signer || !vaultAddress) return;
    setIsClaiming(true);
    setError("");
    try {
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
      const tx = await vault.claimRewards();
      await tx.wait();

      await fetchStats();
    } catch (err) {
      setError("Transaction rejected or failed. Ensure Metamask is on Localhost:8545 and you have pending rewards.");
    }
    setIsClaiming(false);
  };

  const handleUnstake = async () => {
    if (!signer || !vaultAddress || !unstakeIds) return;
    setIsUnstaking(true);
    setError("");
    setBatchStatus({ current: 0, total: 0, active: true });
    try {
      const ids = unstakeIds.split(',').filter(id => id.trim() !== '').map(id => BigInt(id.trim()));
      if (ids.length === 0) throw new Error("No valid IDs provided");

      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
      const CHUNK_SIZE = 50;
      const totalBatches = Math.ceil(ids.length / CHUNK_SIZE);

      setBatchStatus({ current: 0, total: totalBatches, active: true });

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const batchNum = Math.floor(i / CHUNK_SIZE) + 1;
        setBatchStatus(prev => ({ ...prev, current: batchNum }));

        const tx = await vault.batchUnstake(chunk);
        await tx.wait();
      }

      setUnstakeIds("");
      await fetchStats();
      alert(`Success! Successfully unstaked ${ids.length} tokens in ${totalBatches} batches.`);
    } catch (err) {
      console.error(err);
      setError(`Unstake failed: ${err.reason || err.shortMessage || err.message}`);
    }
    setIsUnstaking(false);
    setBatchStatus({ current: 0, total: 0, active: false });
  };

  const handleStake = async () => {
    if (!signer || !vaultAddress || !stakeIds) return;
    setIsStaking(true);
    setError("");
    setBatchStatus({ current: 0, total: 0, active: true });
    try {
      const ids = stakeIds.split(',').filter(id => id.trim() !== '').map(id => BigInt(id.trim()));
      if (ids.length === 0) throw new Error("No valid IDs provided");

      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
      const CHUNK_SIZE = 200;
      const totalBatches = Math.ceil(ids.length / CHUNK_SIZE);

      setBatchStatus({ current: 0, total: totalBatches, active: true });

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const batchNum = Math.floor(i / CHUNK_SIZE) + 1;
        setBatchStatus(prev => ({ ...prev, current: batchNum }));

        const tx = await vault.batchStake(chunk);
        await tx.wait();
      }

      setStakeIds("");
      await fetchStats();
      alert(`Success! Successfully staked ${ids.length} tokens in ${totalBatches} batches.`);
    } catch (err) {
      console.error(err);
      setError(`Stake failed: ${err.reason || err.shortMessage || err.message}`);
    }
    setIsStaking(false);
    setBatchStatus({ current: 0, total: 0, active: false });
  };

  const handleFileUpload = (e, target) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const ids = content.match(/\d+/g);
      if (ids) {
        if (target === 'stake') {
          setStakeIds(ids.join(', '));
        } else {
          setUnstakeIds(ids.join(', '));
        }
      } else {
        setError("Could not find any valid token IDs in the file.");
      }
    };
    reader.readAsText(file);
  };

  const handleSetRate = async () => {
    if (!signer || !vaultAddress || !newRate) return;
    setIsSettingRate(true);
    setError("");
    try {
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
      const rateWei = ethers.parseEther(newRate);
      const tx = await vault.setRewardRate(rateWei);
      await tx.wait();

      setNewRate("");
      await fetchStats();
    } catch (err) {
      setError("Set Rate failed. Ensure you are the owner.");
    }
    setIsSettingRate(false);
  };

  const togglePause = async (pauseState) => {
    if (!signer || !vaultAddress) return;
    setIsPausing(true);
    setError("");
    try {
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
      const tx = await pauseState ? vault.pause() : vault.unpause();
      await tx.wait();
      await fetchStats();
    } catch (err) {
      setError("Pause/Unpause failed. Ensure you are the owner.");
    }
    setIsPausing(false);
  };

  return (
    <div className="container">
      <header className="header">
        <div className="logo">
          <Activity color="var(--accent-blue)" />
          Yield Dashboard
        </div>
        {account ? (
          <div className="btn btn-outline" style={{ cursor: 'default' }}>
            <CheckCircle2 size={18} color="var(--accent-blue)" />
            {account.slice(0, 6)}...{account.slice(-4)}
          </div>
        ) : (
          <button className="btn" onClick={connectWallet}>
            <Wallet size={18} /> Connect MetaMask
          </button>
        )}
      </header>

      {error && <div className="error-box">{error}</div>}

      {account ? (
        <>
          {(!vaultAddress || !pytAddress) && (
            <div className="error-box">
              Missing contract environments! Deploy the contract with `forge script` first to auto-generate the .env file.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
            <button
              className="btn btn-outline"
              onClick={fetchStats}
              disabled={isRefreshing}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 1rem', fontSize: '0.9rem'
              }}
            >
              <RefreshCw size={16} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
              {isRefreshing ? 'Syncing...' : 'Refresh Feed'}
            </button>
          </div>

          <div className="grid">
            <div className="card">
              <div className="card-title"><Layers size={16} /> Total Staked</div>
              <div className="card-value">{stats.staked} <span>NFTs</span></div>
            </div>
            <div className="card">
              <div className="card-title"><TrendingUp size={16} /> Pending Yield</div>
              <div className="card-value">{parseFloat(stats.pending).toFixed(4)} <span>PYT</span></div>
            </div>
            <div className="card">
              <div className="card-title"><Activity size={16} /> Vault Reserves</div>
              <div className="card-value">{parseFloat(stats.vaultReserve).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span>PYT</span></div>
            </div>
            <div className="card">
              <div className="card-title"><Coins size={16} /> Your Balance</div>
              <div className="card-value">{parseFloat(stats.userBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} <span>PYT</span></div>
            </div>
          </div>

          <div className="admin-grid">
            {vaultOwner && account.toLowerCase() !== vaultOwner.toLowerCase() && (
              <div style={{ gridColumn: '1 / -1', background: '#374151', padding: '1rem', borderRadius: '8px', textAlign: 'center' }}>
                <p style={{ margin: 0 }}><strong>Note:</strong> You are not connected with the vault owner wallet. Executing transactions may fail.</p>
              </div>
            )}

            <div className="claim-section" style={{ margin: 0 }}>
              <h3>Claim Your Rewards</h3>
              <p>Sign the transaction with MetaMask to claim pending PYT into your wallet.</p>
              <button
                className="btn"
                style={{ margin: '0 auto', padding: '1rem 3.5rem', fontSize: '1.1rem', borderRadius: '50px' }}
                onClick={handleClaim}
                disabled={isClaiming || parseFloat(stats.pending) === 0 || !vaultAddress}
              >
                {isClaiming ? 'Processing...' : 'Claim PYT'}
              </button>
            </div>

            <div className="claim-section" style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3>Unstake NFTs</h3>
              <p>Vault currently holds <strong>{stats.staked} NFTs</strong>.</p>

              {stats.stakedIds && stats.stakedIds.length > 0 && (
                <div style={{ marginBottom: '1.5rem', background: '#374151', padding: '0.75rem', borderRadius: '8px', width: '100%', maxWidth: '300px', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Currently Staked IDs</span>
                  <strong style={{ color: 'var(--accent-blue)', letterSpacing: '1px' }}>{stats.stakedIds.join(", ")}</strong>
                </div>
              )}

              <div style={{ width: '100%', maxWidth: '300px', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Token IDs to unstake"
                  className="form-input"
                  style={{ marginBottom: 0, flex: 1 }}
                  value={unstakeIds}
                  onChange={(e) => setUnstakeIds(e.target.value)}
                />
                <label className="btn btn-outline" title="Upload IDs from file" style={{ padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Upload size={16} />
                  <input type="file" accept=".txt" onChange={(e) => handleFileUpload(e, 'unstake')} style={{ display: 'none' }} />
                </label>
              </div>
              <button
                className="btn btn-outline"
                style={{ margin: '0 auto', padding: '1rem 3.5rem', fontSize: '1.1rem', borderRadius: '50px' }}
                onClick={handleUnstake}
                disabled={isUnstaking || !unstakeIds || !vaultAddress}
              >
                {isUnstaking
                  ? (batchStatus.active ? `Batch ${batchStatus.current}/${batchStatus.total}` : 'Processing...')
                  : 'Unstake Tokens'}
              </button>
            </div>

            <div className="claim-section" style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3>Stake NFTs</h3>
              <p>Enter Token IDs you own to stake.</p>

              <div style={{ width: '100%', maxWidth: '300px', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="Token IDs to stake"
                  className="form-input"
                  style={{ marginBottom: 0, flex: 1 }}
                  value={stakeIds}
                  onChange={(e) => setStakeIds(e.target.value)}
                />
                <label className="btn btn-outline" title="Upload IDs from file" style={{ padding: '0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Upload size={16} />
                  <input type="file" accept=".txt" onChange={(e) => handleFileUpload(e, 'stake')} style={{ display: 'none' }} />
                </label>
              </div>
              <button
                className="btn btn-outline"
                style={{ margin: '0 auto', padding: '1rem 3.5rem', fontSize: '1.1rem', borderRadius: '50px', marginBottom: '1.5rem' }}
                onClick={handleStake}
                disabled={isStaking || !stakeIds || !vaultAddress}
              >
                {isStaking
                  ? (batchStatus.active ? `Batch ${batchStatus.current}/${batchStatus.total}` : 'Processing...')
                  : 'Stake Tokens'}
              </button>
            </div>

            <div style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
              <UnmintedScanner />
            </div>

            <div className="claim-section" style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3>Admin Controls</h3>
              <p>
                Status: <strong style={{ color: stats.isPaused ? '#ef4444' : '#10b981' }}>{stats.isPaused ? 'PAUSED' : 'ACTIVE'}</strong> |
                Rate: <strong>{stats.rewardRate} PYT/hr</strong>
              </p>

              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', width: '100%', maxWidth: '300px' }}>
                <input
                  type="text"
                  placeholder="Rate (e.g. 1.5 PYT/hr)"
                  className="form-input"
                  style={{ marginBottom: 0, flex: 1 }}
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                />
                <button
                  className="btn btn-outline"
                  onClick={handleSetRate}
                  disabled={isSettingRate || !newRate || !vaultAddress}
                >
                  Set Rate
                </button>
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                <button
                  className="btn btn-outline"
                  style={{ borderColor: '#ef4444', color: '#ef4444' }}
                  onClick={() => togglePause(true)}
                  disabled={isPausing || !vaultAddress}
                >
                  Pause
                </button>
                <button
                  className="btn btn-outline"
                  style={{ borderColor: '#10b981', color: '#10b981' }}
                  onClick={() => togglePause(false)}
                  disabled={isPausing || !vaultAddress}
                >
                  Unpause
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '6rem 0', color: 'var(--text-secondary)' }}>
          <Wallet size={64} style={{ marginBottom: '1.5rem', opacity: 0.5 }} />
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>Connect your wallet to manage yield</h2>
          <p style={{ marginTop: '0.75rem' }}>View staked assets, monitor vault balances, and collect pending PYT rewards.</p>
        </div>
      )}
    </div>
  );
}

export default App;
