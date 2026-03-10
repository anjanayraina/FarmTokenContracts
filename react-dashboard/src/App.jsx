import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wallet, Layers, TrendingUp, Coins, Activity, CheckCircle2 } from 'lucide-react';
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
  const [account, setAccount] = useState("");
  const vaultAddress = import.meta.env.VITE_VAULT_ADDRESS || "";
  const pytAddress = import.meta.env.VITE_PYT_ADDRESS || "";
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);

  const [stats, setStats] = useState({
    staked: "0",
    pending: "0.0",
    vaultReserve: "0.0",
    userBalance: "0.0"
  });
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState("");

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
          console.error(e);
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

      const activeSigner = await browserProvider.getSigner();
      setSigner(activeSigner);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to connect wallet. Please try again.");
    }
  };

  const fetchStats = async () => {
    if (!signer || !ethers.isAddress(vaultAddress) || !ethers.isAddress(pytAddress)) return;
    try {
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
      const pyt = new ethers.Contract(pytAddress, ERC20_ABI, signer);

      const [staked, pending, vaultBal, userBal] = await Promise.all([
        vault.totalStaked(),
        vault.pendingAccumulatedReward(),
        pyt.balanceOf(vaultAddress),
        pyt.balanceOf(account)
      ]);

      setStats({
        staked: staked.toString(),
        pending: ethers.formatEther(pending),
        vaultReserve: ethers.formatEther(vaultBal),
        userBalance: ethers.formatEther(userBal)
      });
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to fetch data from blockchain. Verify contract addresses and network.");
    }
  };

  // Poll for updates every 10 seconds
  useEffect(() => {
    if (account && vaultAddress && pytAddress && signer) {
      fetchStats();
      const interval = setInterval(fetchStats, 10000);
      return () => clearInterval(interval);
    }
  }, [account, vaultAddress, pytAddress, signer]);

  const handleClaim = async () => {
    if (!signer || !vaultAddress) return;
    setIsClaiming(true);
    setError("");
    try {
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
      const tx = await vault.claimRewards();
      await tx.wait();

      // Update stats immediately post confirmation
      await fetchStats();
    } catch (err) {
      console.error(err);
      setError("Transaction rejected or failed. Ensure you are the vault owner with pending rewards.");
    }
    setIsClaiming(false);
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

      {error && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #b91c1c' }}>
          {error}
        </div>
      )}

      {account ? (
        <>
          {(!vaultAddress || !pytAddress) && (
            <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid #b91c1c' }}>
              Missing contract environments! Deploy the contract with `forge script` first to auto-generate the .env file.
            </div>
          )}

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

          <div className="claim-section">
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
