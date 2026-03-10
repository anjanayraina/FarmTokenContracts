import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Wallet, Layers, TrendingUp, Coins, Activity, CheckCircle2 } from 'lucide-react';
import './index.css';

const VAULT_ABI = [
  "function totalStaked() view returns (uint256)",
  "function pendingAccumulatedReward() view returns (uint256)",
  "function rewardRatePerHour() view returns (uint256)",
  "function lastClaimTimestamp() view returns (uint256)",
  "function claimRewards() external",
  "function batchUnstake(uint256[] calldata tokenIds) external"
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
  const [isUnstaking, setIsUnstaking] = useState(false);
  const [unstakeIds, setUnstakeIds] = useState("");
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

      // Request network switch to Localhost (Anvil default is 31337 / 0x7a69)
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x7a69' }], // 31337 in hex
        });
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: '0x7a69',
                  chainName: 'Anvil Localhost',
                  rpcUrls: ['http://127.0.0.1:8545'],
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                },
              ],
            });
          } catch (addError) {
            console.error("Failed to add local network to MetaMask", addError);
          }
        } else {
          console.error("Failed to switch local network", switchError);
        }
      }

      const activeSigner = await browserProvider.getSigner();
      setSigner(activeSigner);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to connect wallet. Please try again.");
    }
  };

  const fetchStats = async () => {
    if (!ethers.isAddress(vaultAddress) || !ethers.isAddress(pytAddress)) return;
    try {
      // Always use local node for reliable read data regardless of Metamask state
      const localProvider = new ethers.JsonRpcProvider("http://localhost:8545");
      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, localProvider);
      const pyt = new ethers.Contract(pytAddress, ERC20_ABI, localProvider);

      const [staked, pending, vaultBal] = await Promise.all([
        vault.totalStaked(),
        vault.pendingAccumulatedReward(),
        pyt.balanceOf(vaultAddress)
      ]);

      let userBal = 0n;
      if (account) {
        userBal = await pyt.balanceOf(account);
      }

      setStats({
        staked: staked.toString(),
        pending: ethers.formatEther(pending),
        vaultReserve: ethers.formatEther(vaultBal),
        userBalance: ethers.formatEther(userBal)
      });
      setError("");
    } catch (err) {
      console.error("fetchStats Error:", err);
      setError("Failed to fetch data. Is Anvil running on localhost:8545? Are contract addresses correct?");
    }
  };

  // Poll for updates every 10 seconds (Runs even without Metamask to show dashboard)
  useEffect(() => {
    if (vaultAddress && pytAddress) {
      fetchStats();
      const interval = setInterval(fetchStats, 10000);
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
      console.error("Claim Error", err);
      setError("Transaction rejected or failed. Ensure Metamask is on Localhost:8545 and you have pending rewards.");
    }
    setIsClaiming(false);
  };

  const handleUnstake = async () => {
    if (!signer || !vaultAddress || !unstakeIds) return;
    setIsUnstaking(true);
    setError("");
    try {
      // Split by comma, remove whitespace, convert to BigInt
      const ids = unstakeIds.split(',').filter(id => id.trim() !== '').map(id => BigInt(id.trim()));
      if (ids.length === 0) throw new Error("No valid IDs provided");

      const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);
      const tx = await vault.batchUnstake(ids);
      await tx.wait();

      setUnstakeIds("");
      await fetchStats();
    } catch (err) {
      console.error("Unstake Error", err);
      setError("Unstake failed. Verify token IDs are comma-separated and currently staked by you.");
    }
    setIsUnstaking(false);
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
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
              <p>Enter Token IDs you wish to pull (e.g., 1, 2, 3).</p>

              <input
                type="text"
                placeholder="Token IDs to unstake"
                value={unstakeIds}
                onChange={(e) => setUnstakeIds(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '300px',
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-main)',
                  color: 'var(--text-primary)'
                }}
              />
              <button
                className="btn btn-outline"
                style={{ margin: '0 auto', padding: '1rem 3.5rem', fontSize: '1.1rem', borderRadius: '50px' }}
                onClick={handleUnstake}
                disabled={isUnstaking || !unstakeIds || !vaultAddress}
              >
                {isUnstaking ? 'Processing...' : 'Unstake Tokens'}
              </button>
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
