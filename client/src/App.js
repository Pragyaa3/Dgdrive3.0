import Upload from "./artifacts/contracts/Upload.sol/Upload.json";
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import FileUpload from "./components/FileUpload";
import Display from "./components/Display";
import Modal from "./components/Modal";
import "./App.css";

function App() {
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [provider, setProvider] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const provider = new ethers.providers.Web3Provider(window.ethereum);

    const loadProvider = async () => {
      if (provider) {
        const handleChainChanged = () => {
          console.log("Chain changed - updating provider");
          // Instead of reloading, update provider state
          setProvider(new ethers.providers.Web3Provider(window.ethereum));
        };

        const handleAccountsChanged = async (accounts) => {
          console.log("Account changed - updating account");
          if (accounts.length > 0) {
            setAccount(accounts[0]);
          } else {
            setAccount("");
            setContract(null);
          }
        };

        window.ethereum.on("chainChanged", handleChainChanged);
        window.ethereum.on("accountsChanged", handleAccountsChanged);

        await provider.send("eth_requestAccounts", []);
        const signer = provider.getSigner();
        const address = await signer.getAddress();
        setAccount(address);
        const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS || "Your Contract Address Here";

        const contract = new ethers.Contract(
          contractAddress,
          Upload.abi,
          signer
        );
        //console.log(contract);
        setContract(contract);
        setProvider(provider);

        // Cleanup function to remove listeners
        return () => {
          window.ethereum.removeListener("chainChanged", handleChainChanged);
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        };
      } else {
        console.error("Metamask is not installed");
      }
    };
    
    const cleanup = provider && loadProvider();
    return () => {
      if (cleanup) cleanup();
    };
  }, []);
  return (
    <>
      {!modalOpen && (
        <button className="share" onClick={() => setModalOpen(true)}>
          Share
        </button>
      )}
      {modalOpen && (
        <Modal setModalOpen={setModalOpen} contract={contract}></Modal>
      )}

      <div className="App">
        <h1 style={{ color: "white" }}>Gdrive 3.0</h1>
        <div class="bg"></div>
        <div class="bg bg2"></div>
        <div class="bg bg3"></div>

        <p style={{ color: "white" }}>
          Account : {account ? account : "Not connected"}
        </p>
        <FileUpload
          account={account}
          provider={provider}
          contract={contract}
        ></FileUpload>
        <Display contract={contract} account={account}></Display>
      </div>
    </>
  );
}

export default App;
