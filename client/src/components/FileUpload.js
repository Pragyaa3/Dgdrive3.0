import { useState } from "react";
import axios from "axios";
import "./FileUpload.css";

const FileUpload = ({ contract, account, provider }) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("No image selected");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Pinata API credentials
  const PINATA_API_KEY = process.env.REACT_APP_PINATA_API_KEY;
  const PINATA_SECRET = process.env.REACT_APP_PINATA_SECRET;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      alert("Please select a file first");
      return;
    }

    if (!contract || !provider) {
      alert("Connect your wallet first");
      return;
    }

    if (!PINATA_API_KEY || !PINATA_SECRET) {
      alert("Pinata API credentials not configured");
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      // Prepare FormData for Pinata
      const formData = new FormData();
      formData.append("file", file);

      // Add metadata for better organization in Pinata
      const metadata = JSON.stringify({
        name: fileName,
        keyvalues: {
          uploader: account,
          uploadDate: new Date().toISOString(),
          fileType: file.type,
          fileSize: file.size
        }
      });
      formData.append("pinataMetadata", metadata);

      // Optional: Add pinning options
      const options = JSON.stringify({
        cidVersion: 1, // Use CIDv1 for better compatibility
      });
      formData.append("pinataOptions", options);

      setUploadProgress(30);

      // Upload to Pinata IPFS
      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          maxBodyLength: "Infinity",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${formData._boundary}`,
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET,
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 60) / progressEvent.total
            );
            setUploadProgress(30 + percentCompleted);
          }
        }
      );

      setUploadProgress(70);

      // Get the IPFS hash from Pinata
      const ipfsHash = pinataResponse.data.IpfsHash;
      const ipfsUri = `ipfs://${ipfsHash}`;

      console.log("Pinata Upload Success:", {
        hash: ipfsHash,
        pinSize: pinataResponse.data.PinSize,
        timestamp: pinataResponse.data.Timestamp
      });

      setUploadProgress(80);

      // Store the IPFS URI on blockchain
      const signer = contract.connect(provider.getSigner());
      const tx = await signer.add(account, ipfsUri);
      
      setUploadProgress(90);
      
      // Wait for transaction confirmation
      await tx.wait();

      setUploadProgress(100);

      alert(`Successfully uploaded to Pinata!\nIPFS Hash: ${ipfsHash}\nYou can view it at: https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
      
      // Reset form
      setFileName("No image selected");
      setFile(null);
      
      setTimeout(() => {
        setUploadProgress(0);
        setUploading(false);
      }, 1500);

    } catch (err) {
      console.error("Upload Error:", err);
      
      if (err.response) {
        // Pinata API error
        alert(`Pinata Upload Failed: ${err.response.data.error || err.response.statusText}`);
      } else if (err.code === 'ACTION_REJECTED') {
        alert("Transaction rejected by user");
      } else {
        alert(`Upload failed: ${err.message}`);
      }
      
      setUploadProgress(0);
      setUploading(false);
    }
  };

  const retrieveFile = (e) => {
    const data = e.target.files[0];
    if (!data) return;

    // Validate file size (Pinata free tier has limits)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (data.size > maxSize) {
      alert("File too large! Maximum size is 100MB");
      return;
    }

    const reader = new window.FileReader();
    reader.readAsArrayBuffer(data);
    reader.onloadend = () => {
      setFile(e.target.files[0]);
    };
    setFileName(e.target.files[0].name);
    e.preventDefault();
  };

  return (
    <div className="top">
      <form className="form" onSubmit={handleSubmit}>
        <label htmlFor="file-upload" className="choose">
          Choose Image
        </label>
        <input
          disabled={!account || uploading}
          type="file"
          id="file-upload"
          name="data"
          onChange={retrieveFile}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
        />
        <span className="textArea">
          {uploading ? `Uploading... ${uploadProgress}%` : `Image: ${fileName}`}
        </span>
        
        {uploading && (
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
        
        <button 
          type="submit" 
          className="upload" 
          disabled={!file || uploading}
        >
          {uploading ? "Uploading..." : "Upload to Pinata"}
        </button>
      </form>
      
      {file && (
        <div className="file-info">
          <p>File size: {(file.size / 1024 / 1024).toFixed(2)} MB</p>
          <p>File type: {file.type || 'Unknown'}</p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;