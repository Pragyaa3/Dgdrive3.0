import Upload from "./artifacts/contracts/Upload.sol/Upload.json";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import axios from "axios";
import "./App.css";

function App() {
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [provider, setProvider] = useState(null);
  const [currentView, setCurrentView] = useState("landing");
  const [files, setFiles] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [shareAddress, setShareAddress] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [accessList, setAccessList] = useState([]);

 const connectMetaMask = async () => {
  // Ensure MetaMask exists
  if (!window.ethereum || !window.ethereum.isMetaMask) {
    alert("MetaMask is not installed. Please install it to continue.");
    return;
  }

  try {
    // Create provider strictly from MetaMask
    const provider = new ethers.providers.Web3Provider(window.ethereum);

    // Request wallet connection
    await provider.send("eth_requestAccounts", []);

    // Get signer + address
    const signer = provider.getSigner();
    const address = await signer.getAddress();

    // Ensure contract address exists
    const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS;
    if (!contractAddress) {
      alert("Contract address not configured!");
      return;
    }

    // Connect to your smart contract
    const contract = new ethers.Contract(contractAddress, Upload.abi, signer);

    // Update state
    setAccount(address);
    setProvider(provider);
    setContract(contract);
    setCurrentView("dashboard");

    // Load user files
    loadFiles(contract, address);

  } catch (error) {
    console.error("Connection error:", error);
    alert("Failed to connect wallet");
  }
};


  const loadFiles = async (contractInstance, userAddress) => {
    try {
      const dataArray = await contractInstance.display(userAddress);
      const filesList = dataArray.map((item, i) => ({
        id: i,
        name: `File ${i + 1}`,
        hash: item.replace(/^ipfs:\/\//, ""),
        url: `https://gateway.pinata.cloud/ipfs/${item.replace(/^ipfs:\/\//, "")}`,
        date: new Date().toLocaleDateString()
      }));
      setFiles(filesList);
    } catch (error) {
      console.error("Error loading files:", error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const metadata = JSON.stringify({
        name: file.name,
        keyvalues: { uploader: account, uploadDate: new Date().toISOString() }
      });
      formData.append("pinataMetadata", metadata);

      setUploadProgress(30);

      const response = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers: {
            pinata_api_key: process.env.REACT_APP_PINATA_API_KEY,
            pinata_secret_api_key: process.env.REACT_APP_PINATA_SECRET
          }
        }
      );

      setUploadProgress(60);

      const ipfsHash = `ipfs://${response.data.IpfsHash}`;
      const signer = contract.connect(provider.getSigner());
      const tx = await signer.add(account, ipfsHash);
      
      setUploadProgress(80);
      await tx.wait();
      
      setUploadProgress(100);
      setTimeout(() => { setUploadProgress(0); setUploading(false); }, 1500);
      
      loadFiles(contract, account);
      alert("File uploaded successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed");
      setUploadProgress(0);
      setUploading(false);
    }
  };

  const shareAccess = async () => {
    if (!shareAddress) {
      alert("Please enter an address");
      return;
    }

    try {
      const tx = await contract.allow(shareAddress);
      await tx.wait();
      alert("Access granted!");
      setModalOpen(false);
      setShareAddress("");
    } catch (error) {
      console.error("Share error:", error);
      alert("Failed to share access");
    }
  };

  const loadAccessList = async () => {
    try {
      const list = await contract.shareAccess();
      setAccessList(list);
    } catch (error) {
      console.error("Error loading access list:", error);
    }
  };

  useEffect(() => {
    if (contract && modalOpen) {
      loadAccessList();
    }
  }, [contract, modalOpen]);

  if (currentView === "landing") {
    return (
      <div className="landing-container">
        {/* Navigation */}
        <nav className="nav-bar">
          <div className="nav-content">
            <div className="logo-section">
              <div className="logo-icon">🔐</div>
              <span className="logo-text">DgDrive3.0</span>
            </div>
            <button onClick={connectMetaMask} className="connect-btn">
              Connect Wallet
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-badge">🚀 Web3 Storage Platform</div>
            <h1 className="hero-title">
              Your Files, Your Rules.
              <span className="gradient-text"> Forever.</span>
            </h1>
            <p className="hero-description">
              Store files on IPFS with blockchain-powered access control. 
              Decentralized, secure, and censorship-resistant storage for the modern web.
            </p>
            <div className="hero-buttons">
              <button onClick={connectMetaMask} className="primary-btn">
                Get Started Free →
              </button>
              <button className="secondary-btn">
                Watch Demo
              </button>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <div className="stat-number">10K+</div>
                <div className="stat-label">Files Stored</div>
              </div>
              <div className="stat">
                <div className="stat-number">5K+</div>
                <div className="stat-label">Active Users</div>
              </div>
              <div className="stat">
                <div className="stat-number">99.9%</div>
                <div className="stat-label">Uptime</div>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="floating-card card-1">
              <div className="card-icon">📁</div>
              <div className="card-text">Decentralized Storage</div>
            </div>
            <div className="floating-card card-2">
              <div className="card-icon">🔒</div>
              <div className="card-text">Blockchain Security</div>
            </div>
            <div className="floating-card card-3">
              <div className="card-icon">⚡</div>
              <div className="card-text">Lightning Fast</div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="features-section">
          <div className="section-header">
            <h2 className="section-title">Why Choose DecentraVault?</h2>
            <p className="section-subtitle">Built on cutting-edge blockchain technology</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🌐</div>
              <h3 className="feature-title">IPFS Storage</h3>
              <p className="feature-desc">Your files are stored on InterPlanetary File System, distributed across thousands of nodes worldwide.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⛓️</div>
              <h3 className="feature-title">Blockchain Access</h3>
              <p className="feature-desc">Smart contracts manage permissions. Only you decide who can access your files.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔐</div>
              <h3 className="feature-title">End-to-End Encryption</h3>
              <p className="feature-desc">Files encrypted before upload. Your private keys never leave your device.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💎</div>
              <h3 className="feature-title">NFT Support</h3>
              <p className="feature-desc">Mint your files as NFTs. Sell, trade, or showcase your digital assets.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🚫</div>
              <h3 className="feature-title">Censorship Resistant</h3>
              <p className="feature-desc">No single point of failure. Your content can't be taken down.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3 className="feature-title">Fast & Reliable</h3>
              <p className="feature-desc">Global CDN ensures quick access from anywhere in the world.</p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="how-section">
          <div className="section-header">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">Get started in 3 simple steps</p>
          </div>
          <div className="steps-container">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3 className="step-title">Connect Your Wallet</h3>
                <p className="step-desc">Use MetaMask or any Web3 wallet to authenticate securely.</p>
              </div>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3 className="step-title">Upload Files to IPFS</h3>
                <p className="step-desc">Your files are pinned on Pinata and stored permanently on IPFS.</p>
              </div>
            </div>
            <div className="step-arrow">→</div>
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3 className="step-title">Share & Control Access</h3>
                <p className="step-desc">Grant or revoke access using smart contracts on the blockchain.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="cta-section">
          <div className="cta-content">
            <h2 className="cta-title">Ready to Take Control of Your Data?</h2>
            <p className="cta-desc">Join thousands of users who trust DecentraVault for secure, decentralized storage.</p>
            <button onClick={
              
              
              connectMetaMask} className="cta-btn">
              Start Storing Now →
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="footer">
          <div className="footer-content">
            <div className="footer-col">
              <div className="footer-logo">
                <div className="logo-icon">🔐</div>
                <span className="logo-text">DecentraVault</span>
              </div>
              <p className="footer-desc">Decentralized storage for the modern web.</p>
            </div>
            <div className="footer-col">
              <h4 className="footer-heading">Product</h4>
              <a href="#" className="footer-link">Features</a>
              <a href="#" className="footer-link">Pricing</a>
              <a href="#" className="footer-link">Documentation</a>
            </div>
            <div className="footer-col">
              <h4 className="footer-heading">Company</h4>
              <a href="#" className="footer-link">About</a>
              <a href="#" className="footer-link">Blog</a>
              <a href="#" className="footer-link">Careers</a>
            </div>
            <div className="footer-col">
              <h4 className="footer-heading">Support</h4>
              <a href="#" className="footer-link">Help Center</a>
              <a href="#" className="footer-link">Contact</a>
              <a href="#" className="footer-link">Status</a>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© Drive3.0. Built with ❤️ on the blockchain.</p>
          </div>
        </footer>
      </div>
    );
  }

  // Dashboard View
  return (
    <div className="dashboard-container">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="top-bar-left">
          <div className="logo-icon">🔐</div>
          <span className="logo-text">DgDrive3.0  </span>
        </div>
        <div className="top-bar-right">
          <div className="account-badge">
            {account.slice(0, 6)}...{account.slice(-4)}
          </div>
          <button onClick={() => setCurrentView("landing")} className="logout-btn">
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-layout">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-section">
            <label htmlFor="file-upload" className="upload-btn-large">
              <span className="upload-icon">📤</span>
              <span>Upload File</span>
            </label>
            <input
              id="file-upload"
              type="file"
              onChange={handleFileUpload}
              style={{ display: "none" }}
            />
            
            {uploadProgress > 0 && (
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                <span className="progress-text">{uploadProgress}%</span>
              </div>
            )}
          </div>

          <div className="sidebar-section">
            <button onClick={() => setModalOpen(true)} className="share-btn-large">
              <span className="share-icon">🔗</span>
              <span>Share Access</span>
            </button>
          </div>

          <div className="sidebar-stats">
            <div className="stat-item">
              <div className="stat-icon">📁</div>
              <div>
                <div className="stat-value">{files.length}</div>
                <div className="stat-label">Files Stored</div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">🔒</div>
              <div>
                <div className="stat-value">{accessList.length}</div>
                <div className="stat-label">Shared With</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="main-content">
          <div className="content-header">
            <h2 className="content-title">My Files</h2>
            <p className="content-subtitle">{files.length} files stored on IPFS</p>
          </div>

          {files.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📂</div>
              <h3 className="empty-title">No files yet</h3>
              <p className="empty-desc">Upload your first file to get started</p>
            </div>
          ) : (
            <div className="files-grid">
              {files.map((file) => (
                <div key={file.id} className="file-card">
                  <div className="file-preview">
                    <img src={file.url} alt={file.name} onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }} />
                    <div className="file-icon-fallback" style={{ display: 'none' }}>
                      📄
                    </div>
                  </div>
                  <div className="file-info">
                    <h4 className="file-name">{file.name}</h4>
                    <p className="file-date">{file.date}</p>
                    <div className="file-actions">
                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="file-action-btn">
                        View
                      </a>
                      <a href={`${file.url}?download=true`} className="file-action-btn secondary">
                        Download
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Share Access</h3>
              <button onClick={() => setModalOpen(false)} className="modal-close">✕</button>
            </div>
            <div className="modal-body">
              <label className="input-label">Wallet Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={shareAddress}
                onChange={(e) => setShareAddress(e.target.value)}
                className="modal-input"
              />
              
              {accessList.length > 0 && (
                <div className="access-list">
                  <h4 className="access-list-title">People with access:</h4>
                  {accessList.map((item, i) => (
                    <div key={i} className="access-item">
                      <span>{item.user.slice(0, 6)}...{item.user.slice(-4)}</span>
                      <span className={item.access ? "access-badge active" : "access-badge"}>
                        {item.access ? "Active" : "Revoked"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="modal-btn secondary">
                Cancel
              </button>
              <button onClick={shareAccess} className="modal-btn primary">
                Grant Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;