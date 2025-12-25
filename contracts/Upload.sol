// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

contract Upload {
    
    struct FileMetadata {
        string ipfsHash;
        string fileName;
        string fileType;
        uint256 fileSize;
        uint256 uploadTime;
        bool isEncrypted;
        address uploader;
    }
    
    struct Access {
        address user;
        bool access;
    }

    struct SharedFile {
        address owner;
        string ipfsHash;
        uint256 sharedTime;
    }

    enum Permission { NONE, VIEW, DOWNLOAD, EDIT }

    struct ShareableLink {
        string ipfsHash;
        string password;
        uint256 expirationTime;
        bool isActive;
        address owner;
        Permission permission;
    }

    struct FilePermission {
        address user;
        Permission permission;
    }
    
    // User files mapping
    mapping(address => FileMetadata[]) private userFiles;
    
    // Access control
    mapping(address => mapping(address => bool)) private ownership;
    mapping(address => Access[]) private accessList;
    mapping(address => mapping(address => bool)) private previousData;
    
    // Shared files tracking
    mapping(address => SharedFile[]) private sharedWithMe;
    
    // File versioning
    mapping(address => mapping(string => uint256)) private fileVersions;

    // Shareable links
    mapping(string => ShareableLink) private shareableLinks;

    // Individual file permissions
    mapping(address => mapping(uint256 => FilePermission[])) private filePermissions;

    // Events
    event FileUploaded(address indexed user, string ipfsHash, string fileName, uint256 timestamp);
    event FileShared(address indexed from, address indexed to, string ipfsHash, uint256 timestamp);
    event AccessRevoked(address indexed from, address indexed to, uint256 timestamp);
    event FileDeleted(address indexed user, uint256 fileIndex, uint256 timestamp);
    event ShareableLinkCreated(address indexed owner, string linkId, uint256 expirationTime);
    event FilePermissionGranted(address indexed owner, uint256 fileIndex, address indexed user, Permission permission);
    
    // Upload file with metadata
    function addFile(
        string memory _ipfsHash,
        string memory _fileName,
        string memory _fileType,
        uint256 _fileSize,
        bool _isEncrypted
    ) external {
        FileMetadata memory newFile = FileMetadata({
            ipfsHash: _ipfsHash,
            fileName: _fileName,
            fileType: _fileType,
            fileSize: _fileSize,
            uploadTime: block.timestamp,
            isEncrypted: _isEncrypted,
            uploader: msg.sender
        });
        
        userFiles[msg.sender].push(newFile);
        
        // Increment version if file exists
        fileVersions[msg.sender][_fileName]++;
        
        emit FileUploaded(msg.sender, _ipfsHash, _fileName, block.timestamp);
    }
    
    // Legacy add function for backward compatibility
    function add(address _user, string memory url) external {
        FileMetadata memory newFile = FileMetadata({
            ipfsHash: url,
            fileName: "Unknown",
            fileType: "Unknown",
            fileSize: 0,
            uploadTime: block.timestamp,
            isEncrypted: false,
            uploader: _user
        });
        
        userFiles[_user].push(newFile);
        emit FileUploaded(_user, url, "Unknown", block.timestamp);
    }
    
    // Get all files for a user
    function getFiles(address _user) external view returns (FileMetadata[] memory) {
        require(_user == msg.sender || ownership[_user][msg.sender], "You don't have access");
        return userFiles[_user];
    }
    
    // Legacy display function for backward compatibility
    function display(address _user) external view returns (string[] memory) {
        require(_user == msg.sender || ownership[_user][msg.sender], "You don't have access");
        
        FileMetadata[] memory files = userFiles[_user];
        string[] memory hashes = new string[](files.length);
        
        for (uint i = 0; i < files.length; i++) {
            hashes[i] = files[i].ipfsHash;
        }
        
        return hashes;
    }
    
    // Grant access to another user
    function allow(address user) external {
        require(user != msg.sender, "Cannot share with yourself");
        
        ownership[msg.sender][user] = true;
        
        if (previousData[msg.sender][user]) {
            for (uint i = 0; i < accessList[msg.sender].length; i++) {
                if (accessList[msg.sender][i].user == user) {
                    accessList[msg.sender][i].access = true;
                }
            }
        } else {
            accessList[msg.sender].push(Access(user, true));
            previousData[msg.sender][user] = true;
        }
        
        // Add to shared files list
        FileMetadata[] memory files = userFiles[msg.sender];
        for (uint i = 0; i < files.length; i++) {
            sharedWithMe[user].push(SharedFile({
                owner: msg.sender,
                ipfsHash: files[i].ipfsHash,
                sharedTime: block.timestamp
            }));
        }
        
        emit FileShared(msg.sender, user, "all", block.timestamp);
    }
    
    // Revoke access
    function disallow(address user) external {
        ownership[msg.sender][user] = false;
        
        for (uint i = 0; i < accessList[msg.sender].length; i++) {
            if (accessList[msg.sender][i].user == user) {
                accessList[msg.sender][i].access = false;
            }
        }
        
        // Remove from shared files
        delete sharedWithMe[user];
        
        emit AccessRevoked(msg.sender, user, block.timestamp);
    }
    
    // Get access list
    function shareAccess() external view returns (Access[] memory) {
        return accessList[msg.sender];
    }
    
    // Get files shared with me
    function getSharedFiles() external view returns (SharedFile[] memory) {
        return sharedWithMe[msg.sender];
    }
    
    // Delete a file
    function deleteFile(uint256 _fileIndex) external {
        require(_fileIndex < userFiles[msg.sender].length, "Invalid file index");
        
        // Remove file by swapping with last element and popping
        userFiles[msg.sender][_fileIndex] = userFiles[msg.sender][userFiles[msg.sender].length - 1];
        userFiles[msg.sender].pop();
        
        emit FileDeleted(msg.sender, _fileIndex, block.timestamp);
    }
    
    // Get total files count
    function getFileCount(address _user) external view returns (uint256) {
        return userFiles[_user].length;
    }
    
    // Get file version
    function getFileVersion(address _user, string memory _fileName) external view returns (uint256) {
        return fileVersions[_user][_fileName];
    }
    
    // Check if user has access
    function hasAccess(address _owner, address _user) external view returns (bool) {
        return ownership[_owner][_user];
    }
    
    // Get storage stats
    function getStorageStats(address _user) external view returns (
        uint256 totalFiles,
        uint256 totalSize,
        uint256 encryptedFiles
    ) {
        FileMetadata[] memory files = userFiles[_user];
        totalFiles = files.length;

        for (uint i = 0; i < files.length; i++) {
            totalSize += files[i].fileSize;
            if (files[i].isEncrypted) {
                encryptedFiles++;
            }
        }

        return (totalFiles, totalSize, encryptedFiles);
    }

    // Create shareable link with expiration
    function createShareableLink(
        uint256 _fileIndex,
        string memory _linkId,
        string memory _password,
        uint256 _expirationHours,
        Permission _permission
    ) external {
        require(_fileIndex < userFiles[msg.sender].length, "Invalid file index");

        FileMetadata memory file = userFiles[msg.sender][_fileIndex];
        uint256 expirationTime = block.timestamp + (_expirationHours * 1 hours);

        shareableLinks[_linkId] = ShareableLink({
            ipfsHash: file.ipfsHash,
            password: _password,
            expirationTime: expirationTime,
            isActive: true,
            owner: msg.sender,
            permission: _permission
        });

        emit ShareableLinkCreated(msg.sender, _linkId, expirationTime);
    }

    // Get shareable link details
    function getShareableLink(string memory _linkId) external view returns (ShareableLink memory) {
        return shareableLinks[_linkId];
    }

    // Revoke shareable link
    function revokeShareableLink(string memory _linkId) external {
        require(shareableLinks[_linkId].owner == msg.sender, "Not the owner");
        shareableLinks[_linkId].isActive = false;
    }

    // Grant individual file permission
    function grantFilePermission(
        uint256 _fileIndex,
        address _user,
        Permission _permission
    ) external {
        require(_fileIndex < userFiles[msg.sender].length, "Invalid file index");
        require(_user != msg.sender, "Cannot grant permission to yourself");

        filePermissions[msg.sender][_fileIndex].push(FilePermission({
            user: _user,
            permission: _permission
        }));

        emit FilePermissionGranted(msg.sender, _fileIndex, _user, _permission);
    }

    // Revoke individual file permission
    function revokeFilePermission(uint256 _fileIndex, address _user) external {
        require(_fileIndex < userFiles[msg.sender].length, "Invalid file index");

        FilePermission[] storage permissions = filePermissions[msg.sender][_fileIndex];
        for (uint i = 0; i < permissions.length; i++) {
            if (permissions[i].user == _user) {
                permissions[i] = permissions[permissions.length - 1];
                permissions.pop();
                break;
            }
        }
    }

    // Get file permissions
    function getFilePermissions(address _owner, uint256 _fileIndex) external view returns (FilePermission[] memory) {
        return filePermissions[_owner][_fileIndex];
    }

    // Check if user has permission for specific file
    function hasFilePermission(address _owner, uint256 _fileIndex, address _user) external view returns (Permission) {
        FilePermission[] memory permissions = filePermissions[_owner][_fileIndex];
        for (uint i = 0; i < permissions.length; i++) {
            if (permissions[i].user == _user) {
                return permissions[i].permission;
            }
        }
        return Permission.NONE;
    }
}