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
  const [sharedFiles, setSharedFiles] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [shareAddress, setShareAddress] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [accessList, setAccessList] = useState([]);
  const [activeTab, setActiveTab] = useState("myfiles");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [encryptionPassword, setEncryptionPassword] = useState("");

 const connectMetaMask = async () => {
  // Ensure MetaMask exists
  if (!window.ethereum) {
    alert("MetaMask is not installed. Please install it to continue.");
    return;
  }

  try {
    // Create provider strictly from MetaMask
    const provider = new ethers.providers.Web3Provider(window.ethereum);

    // Request wallet connection
    await provider.send("eth_requestAccounts", []);

    // Check network - Sepolia testnet chainId is 11155111
    const network = await provider.getNetwork();
    const SEPOLIA_CHAIN_ID = 11155111;

    if (network.chainId !== SEPOLIA_CHAIN_ID) {
      try {
        // Try to switch to Sepolia
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }], // 11155111 in hex
        });
      } catch (switchError) {
        // This error code indicates that the chain has not been added to MetaMask
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0xaa36a7',
                chainName: 'Sepolia Testnet',
                nativeCurrency: {
                  name: 'SepoliaETH',
                  symbol: 'ETH',
                  decimals: 18
                },
                rpcUrls: ['https://rpc.sepolia.org'],
                blockExplorerUrls: ['https://sepolia.etherscan.io']
              }]
            });
          } catch (addError) {
            alert("Failed to add Sepolia network to MetaMask");
            return;
          }
        } else {
          alert("Please switch to Sepolia testnet in MetaMask to continue");
          return;
        }
      }
    }

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


  // Encryption helper functions
  const encryptFile = async (file, password) => {
    const arrayBuffer = await file.arrayBuffer();
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode("salt"), iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      arrayBuffer
    );
    const encryptedArray = new Uint8Array(encrypted);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);
    return new Blob([combined], { type: file.type });
  };

  const decryptFile = async (encryptedBlob, password, fileName) => {
    try {
      const arrayBuffer = await encryptedBlob.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // Extract IV (first 12 bytes) and encrypted data
      const iv = data.slice(0, 12);
      const encryptedData = data.slice(12);

      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"]
      );
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode("salt"), iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedData
      );

      return new Blob([decrypted]);
    } catch (error) {
      console.error("Decryption error:", error);
      throw new Error("Incorrect password or corrupted file");
    }
  };

  const handleEncryptedFileAccess = async (file, action) => {
    const password = prompt(`🔒 This file is encrypted.\n\nEnter password to ${action}:`);

    if (!password) {
      alert("Password required to access encrypted files");
      return;
    }

    try {
      // Fetch the encrypted file from IPFS
      const response = await fetch(file.url);
      const encryptedBlob = await response.blob();

      // Decrypt the file
      const decryptedBlob = await decryptFile(encryptedBlob, password, file.name);

      // Create a download URL for the decrypted file
      const url = URL.createObjectURL(decryptedBlob);

      if (action === "view") {
        // Open in new tab
        window.open(url, '_blank');
      } else if (action === "download") {
        // Trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }

      // Clean up the URL after a short delay
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      alert(`✅ File decrypted successfully!`);
    } catch (error) {
      alert(`❌ Decryption failed: ${error.message}\n\nPlease check your password and try again.`);
    }
  };

  const loadFiles = async (contractInstance, userAddress) => {
    try {
      const filesData = await contractInstance.getFiles(userAddress);

      // Get version numbers for files
      const filesListPromises = filesData.map(async (file, i) => {
        let version = 1;
        try {
          version = Number(await contractInstance.getFileVersion(userAddress, file.fileName));
        } catch (err) {
          // If getFileVersion fails, default to 1
        }

        return {
          id: i,
          name: file.fileName || `File ${i + 1}`,
          hash: file.ipfsHash.replace(/^ipfs:\/\//, ""),
          url: `https://gateway.pinata.cloud/ipfs/${file.ipfsHash.replace(/^ipfs:\/\//, "")}`,
          date: new Date(Number(file.uploadTime) * 1000).toLocaleDateString(),
          time: new Date(Number(file.uploadTime) * 1000).toLocaleTimeString(),
          size: Number(file.fileSize),
          type: file.fileType,
          encrypted: file.isEncrypted,
          uploader: file.uploader,
          version: version
        };
      });

      const filesList = await Promise.all(filesListPromises);
      setFiles(filesList);
    } catch (error) {
      console.error("Error loading files:", error);
      // Fallback to legacy display method
      try {
        const dataArray = await contractInstance.display(userAddress);
        const filesList = dataArray.map((item, i) => ({
          id: i,
          name: `File ${i + 1}`,
          hash: item.replace(/^ipfs:\/\//, ""),
          url: `https://gateway.pinata.cloud/ipfs/${item.replace(/^ipfs:\/\//, "")}`,
          date: new Date().toLocaleDateString(),
          encrypted: false,
          version: 1
        }));
        setFiles(filesList);
      } catch (err) {
        console.error("Fallback also failed:", err);
      }
    }
  };

  const loadSharedFiles = async (contractInstance) => {
    try {
      const sharedData = await contractInstance.getSharedFiles();
      const sharedList = sharedData.map((file, i) => ({
        id: i,
        owner: file.owner,
        hash: file.ipfsHash.replace(/^ipfs:\/\//, ""),
        url: `https://gateway.pinata.cloud/ipfs/${file.ipfsHash.replace(/^ipfs:\/\//, "")}`,
        date: new Date(Number(file.sharedTime) * 1000).toLocaleDateString(),
        sharedTime: Number(file.sharedTime)
      }));
      setSharedFiles(sharedList);
    } catch (error) {
      console.error("Error loading shared files:", error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(10);

    try {
      let fileToUpload = file;
      let isEncrypted = false;

      // Encrypt if password is provided
      if (encryptionPassword) {
        fileToUpload = await encryptFile(file, encryptionPassword);
        isEncrypted = true;
        setUploadProgress(20);
      }

      const formData = new FormData();
      formData.append("file", fileToUpload);

      const metadata = JSON.stringify({
        name: file.name,
        keyvalues: {
          uploader: account,
          uploadDate: new Date().toISOString(),
          encrypted: isEncrypted ? "true" : "false"  // Must be string, not boolean
        }
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

      // Try to use new addFile function with metadata
      try {
        const tx = await signer.addFile(
          ipfsHash,
          file.name,
          file.type || "unknown",
          file.size,
          isEncrypted
        );
        setUploadProgress(80);
        await tx.wait();
      } catch (err) {
        // Fallback to legacy add function
        console.log("Using legacy add function");
        const tx = await signer.add(account, ipfsHash);
        setUploadProgress(80);
        await tx.wait();
      }

      setUploadProgress(100);
      setTimeout(() => {
        setUploadProgress(0);
        setUploading(false);
        setEncryptionPassword("");
      }, 1500);

      loadFiles(contract, account);
      loadSharedFiles(contract);
      alert(isEncrypted ? "File encrypted and uploaded successfully!" : "File uploaded successfully!");
    } catch (error) {
      console.error("Upload error:", error);
      console.error("Error response:", error.response?.data);
      const errorMsg = error.response?.data?.error || error.message || "Unknown error";
      alert("Upload failed: " + errorMsg + "\n\nPlease check your Pinata API credentials in the .env file");
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
      loadAccessList();
      setShareAddress("");
    } catch (error) {
      console.error("Share error:", error);
      alert("Failed to share access");
    }
  };

  const revokeAccess = async (userAddress) => {
    try {
      const tx = await contract.disallow(userAddress);
      await tx.wait();
      alert("Access revoked successfully!");
      loadAccessList();
    } catch (error) {
      console.error("Revoke error:", error);
      alert("Failed to revoke access");
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
    if (contract) {
      loadAccessList();
      loadSharedFiles(contract);
    }
  }, [contract]);

  useEffect(() => {
    if (contract && modalOpen) {
      loadAccessList();
    }
  }, [contract, modalOpen]);

  // Filter and search files
  const getFilteredFiles = () => {
    let filtered = activeTab === "myfiles" ? files : sharedFiles;

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(file =>
        file.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        file.hash?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply filter
    if (filterType !== "all") {
      if (filterType === "encrypted") {
        filtered = filtered.filter(file => file.encrypted);
      } else if (filterType === "images") {
        filtered = filtered.filter(file => file.type?.startsWith("image/"));
      } else if (filterType === "documents") {
        filtered = filtered.filter(file =>
          file.type?.includes("pdf") ||
          file.type?.includes("document") ||
          file.type?.includes("text")
        );
      }
    }

    return filtered;
  };

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

            {/* Encryption Option */}
            <div style={{ marginTop: "10px" }}>
              <input
                type="password"
                placeholder="🔒 Encrypt? (optional password)"
                value={encryptionPassword}
                onChange={(e) => setEncryptionPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid #ddd",
                  fontSize: "12px"
                }}
              />
            </div>

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
              <span>Manage Access</span>
            </button>
          </div>

          <div className="sidebar-stats">
            <div className="stat-item">
              <div className="stat-icon">📁</div>
              <div>
                <div className="stat-value">{files.length}</div>
                <div className="stat-label">My Files</div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">👥</div>
              <div>
                <div className="stat-value">{sharedFiles.length}</div>
                <div className="stat-label">Shared With Me</div>
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-icon">🔒</div>
              <div>
                <div className="stat-value">{accessList.filter(a => a.access).length}</div>
                <div className="stat-label">Access Granted</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="main-content">
          {/* Tabs */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", borderBottom: "2px solid #eee" }}>
            <button
              onClick={() => setActiveTab("myfiles")}
              style={{
                padding: "10px 20px",
                background: activeTab === "myfiles" ? "#6366f1" : "transparent",
                color: activeTab === "myfiles" ? "white" : "#666",
                border: "none",
                borderBottom: activeTab === "myfiles" ? "3px solid #6366f1" : "none",
                cursor: "pointer",
                fontWeight: "600"
              }}
            >
              📁 My Files ({files.length})
            </button>
            <button
              onClick={() => setActiveTab("shared")}
              style={{
                padding: "10px 20px",
                background: activeTab === "shared" ? "#6366f1" : "transparent",
                color: activeTab === "shared" ? "white" : "#666",
                border: "none",
                borderBottom: activeTab === "shared" ? "3px solid #6366f1" : "none",
                cursor: "pointer",
                fontWeight: "600"
              }}
            >
              👥 Shared With Me ({sharedFiles.length})
            </button>
          </div>

          {/* Search and Filter */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <input
              type="text"
              placeholder="🔍 Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: "10px 15px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                fontSize: "14px"
              }}
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                padding: "10px 15px",
                borderRadius: "8px",
                border: "1px solid #ddd",
                fontSize: "14px",
                cursor: "pointer"
              }}
            >
              <option value="all">All Files</option>
              <option value="images">📷 Images</option>
              <option value="documents">📄 Documents</option>
              <option value="encrypted">🔒 Encrypted</option>
            </select>
          </div>

          <div className="content-header">
            <h2 className="content-title">
              {activeTab === "myfiles" ? "My Files" : "Shared With Me"}
            </h2>
            <p className="content-subtitle">
              {getFilteredFiles().length} {activeTab === "myfiles" ? "files stored on IPFS" : "files shared with you"}
            </p>
          </div>

          {getFilteredFiles().length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📂</div>
              <h3 className="empty-title">
                {activeTab === "myfiles" ? "No files yet" : "No shared files"}
              </h3>
              <p className="empty-desc">
                {activeTab === "myfiles"
                  ? "Upload your first file to get started"
                  : "No one has shared files with you yet"}
              </p>
            </div>
          ) : (
            <div className="files-grid">
              {getFilteredFiles().map((file) => (
                <div key={file.id} className="file-card">
                  {file.encrypted && (
                    <div style={{
                      position: "absolute",
                      top: "10px",
                      right: "10px",
                      background: "#fbbf24",
                      color: "white",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "600"
                    }}>
                      🔒 Encrypted
                    </div>
                  )}
                  {activeTab === "shared" && (
                    <div style={{
                      position: "absolute",
                      top: "10px",
                      left: "10px",
                      background: "#10b981",
                      color: "white",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "10px",
                      fontWeight: "600"
                    }}>
                      View Only
                    </div>
                  )}
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h4 className="file-name">{file.name}</h4>
                      {file.version && file.version > 1 && (
                        <span style={{
                          background: "#8b5cf6",
                          color: "white",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: "600"
                        }}>
                          v{file.version}
                        </span>
                      )}
                    </div>
                    <p className="file-date">{file.date} {file.time && `• ${file.time}`}</p>
                    {activeTab === "shared" && file.owner && (
                      <p style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                        Owner: {file.owner.slice(0, 6)}...{file.owner.slice(-4)}
                      </p>
                    )}
                    {file.type && (
                      <p style={{ fontSize: "11px", color: "#999", marginTop: "2px" }}>
                        {file.type}
                      </p>
                    )}
                    {file.size > 0 && (
                      <p style={{ fontSize: "10px", color: "#999", marginTop: "2px" }}>
                        Size: {(file.size / 1024).toFixed(2)} KB
                      </p>
                    )}
                    <div className="file-actions">
                      {file.encrypted ? (
                        <>
                          <button
                            onClick={() => handleEncryptedFileAccess(file, "view")}
                            className="file-action-btn"
                          >
                            🔓 View
                          </button>
                          <button
                            onClick={() => handleEncryptedFileAccess(file, "download")}
                            className="file-action-btn secondary"
                          >
                            🔓 Download
                          </button>
                        </>
                      ) : (
                        <>
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="file-action-btn">
                            View
                          </a>
                          <a href={`${file.url}?download=true`} className="file-action-btn secondary">
                            Download
                          </a>
                        </>
                      )}
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "10px", color: "#999", fontFamily: "monospace" }}>
                      CID: {file.hash.slice(0, 8)}...{file.hash.slice(-6)}
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
              <h3 className="modal-title">Manage Access Control</h3>
              <button onClick={() => setModalOpen(false)} className="modal-close">✕</button>
            </div>
            <div className="modal-body">
              <label className="input-label">Grant Access to Wallet Address</label>
              <div style={{ display: "flex", gap: "10px" }}>
                <input
                  type="text"
                  placeholder="0x..."
                  value={shareAddress}
                  onChange={(e) => setShareAddress(e.target.value)}
                  className="modal-input"
                  style={{ flex: 1 }}
                />
                <button onClick={shareAccess} className="modal-btn primary" style={{ whiteSpace: "nowrap" }}>
                  Grant Access
                </button>
              </div>

              {accessList.length > 0 && (
                <div className="access-list" style={{ marginTop: "20px" }}>
                  <h4 className="access-list-title">Access Control List:</h4>
                  {accessList.map((item, i) => (
                    <div key={i} className="access-item" style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px",
                      background: "#f9fafb",
                      borderRadius: "6px",
                      marginBottom: "8px"
                    }}>
                      <div>
                        <span style={{ fontFamily: "monospace", fontSize: "13px" }}>
                          {item.user.slice(0, 6)}...{item.user.slice(-4)}
                        </span>
                        <span
                          className={item.access ? "access-badge active" : "access-badge"}
                          style={{
                            marginLeft: "10px",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            background: item.access ? "#10b981" : "#ef4444",
                            color: "white"
                          }}
                        >
                          {item.access ? "✓ Active" : "✗ Revoked"}
                        </span>
                      </div>
                      {item.access && (
                        <button
                          onClick={() => revokeAccess(item.user)}
                          style={{
                            padding: "4px 12px",
                            background: "#ef4444",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "12px"
                          }}
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalOpen(false)} className="modal-btn secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;