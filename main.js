const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron'); // Add shell here
const path = require('path');
const fs = require('fs');
const url = require('url');
const appPackage = require('./package.json');
const { scanDirectory } = require('./fileScanner');
const { generateThumbnail, THUMBNAILS_DIR, generateExpectedThumbnailFilename } = require('./thumbnailGenerator'); // Import new items

// --- 開発時のみリロードを有効化 ---
if (process.env.NODE_ENV !== 'production') {
  try {
    const electronPath = require('electron'); // Get the path to electron
    require('electron-reload')(__dirname, {
      electron: electronPath, // Use the resolved path
      hardResetMethod: 'exit' // Recommended for main process changes
    });
  } catch (e) {
    console.error('electron-reload could not be loaded. If you are not in a dev environment, this is normal. Error:', e);
  }
}
// -------------------------------------

const THUMBNAIL_GENERATION_TIMEOUT = 30000; // 30 seconds
const thumbnailQueue = [];
let activeThumbnailWorkers = 0;
const MAX_CONCURRENT_THUMBNAIL_WORKERS = 2; // Or 3, or 4. Let's start with 2.
const MEMOS_DIR = path.join(app.getPath('userData'), 'memos');

async function processThumbnailQueue() {
    console.log('[QUEUE] processThumbnailQueue called.');
    if (activeThumbnailWorkers >= MAX_CONCURRENT_THUMBNAIL_WORKERS || thumbnailQueue.length === 0) {
        return; // Max workers busy or queue is empty
    }
    console.log(`[QUEUE] State before dequeue: Queue length: ${thumbnailQueue.length}, Active workers: ${activeThumbnailWorkers}`);
    const task = thumbnailQueue.shift(); // Get the next task
    console.log(`[QUEUE] Dequeued task for: ${task.filePath}, Type: ${task.fileType}, RendererRequest: ${task.isRendererRequest}`);
    activeThumbnailWorkers++;

    // This console.log was part of the original prompt, but it's very similar to the one above.
    // For clarity, I'll use the more detailed one above.
    // console.log(`Processing thumbnail for: ${task.filePath}. Queue size: ${thumbnailQueue.length}, Active workers: ${activeThumbnailWorkers}`);

    try {
        console.log(`[QUEUE] Calling generateThumbnail for: ${task.filePath}`);

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), THUMBNAIL_GENERATION_TIMEOUT)
        );

        let thumbResult;
        try {
            // Race generateThumbnail against the timeout
            thumbResult = await Promise.race([
                generateThumbnail(task.filePath, task.fileType),
                timeoutPromise
            ]);
        } catch (e) {
            // This catch is specifically for the Promise.race rejection (i.e., timeout)
            if (e.message === 'timeout') {
                console.error(`[QUEUE] Thumbnail generation timed out for: ${task.filePath}`);
                thumbResult = { generatedThumbnailPath: null, error: 'timeout', details: `Thumbnail generation timed out after ${THUMBNAIL_GENERATION_TIMEOUT / 1000} seconds.` };
            } else {
                // Re-throw other unexpected errors from generateThumbnail if it somehow throws instead of returning an error object
                // though current generateThumbnail is designed to return errors in its result object.
                console.error(`[QUEUE] Unexpected error during generateThumbnail race for ${task.filePath}:`, e);
                thumbResult = { generatedThumbnailPath: null, error: 'unexpected_error', details: e.message };
            }
        }

        console.log(`[QUEUE] generateThumbnail (or timeout) returned for: ${task.filePath}. Result error: ${thumbResult.error}, Path: ${thumbResult.generatedThumbnailPath}`);

        // Update allScannedMediaFiles regardless of request type or success/failure
        // If there was an error (timeout or other), generatedThumbnailPath will be null.
        const fileIndex = allScannedMediaFiles.findIndex(file => file.filePath === task.filePath);
        if (fileIndex !== -1) {
            if (thumbResult.generatedThumbnailPath) {
                allScannedMediaFiles[fileIndex].thumbnailPath = thumbResult.generatedThumbnailPath;
                // Clear any previous error state if we now have a thumbnail
                delete allScannedMediaFiles[fileIndex].thumbnailError;
                console.log(`Updated allScannedMediaFiles for ${task.filePath} with new thumbnail path.`);
            } else if (thumbResult.error) {
                // Optionally store error information in allScannedMediaFiles
                allScannedMediaFiles[fileIndex].thumbnailError = { error: thumbResult.error, details: thumbResult.details };
                allScannedMediaFiles[fileIndex].thumbnailPath = null; // Ensure path is null on error
                console.log(`Recorded thumbnail error for ${task.filePath} in allScannedMediaFiles.`);
            }
        }

        if (task.isRendererRequest && task.windowId !== undefined) {
            const targetWindow = BrowserWindow.fromId(task.windowId);
            if (targetWindow && !targetWindow.isDestroyed()) {
                console.log(`[QUEUE] Sending 'thumbnail-generated' IPC for: ${task.filePath}, ImgID: ${task.imgIdForRenderer}`);
                targetWindow.webContents.send('thumbnail-generated', {
                    originalImgId: task.imgIdForRenderer,
                    filePath: task.filePath,
                    ...thumbResult // spread the result: generatedThumbnailPath, error, details
                });
            } else {
                console.warn(`Target window for thumbnail result no longer exists or is invalid. Window ID: ${task.windowId}, File: ${task.filePath}`);
            }
        }
    } catch (error) { // Outer catch: for errors in the try block logic itself, not from generateThumbnail directly
        console.error(`[QUEUE] CATCH BLOCK error during thumbnail processing logic for ${task.filePath}: `, error);
        if (task.isRendererRequest && task.windowId !== undefined) {
            const targetWindow = BrowserWindow.fromId(task.windowId);
            if (targetWindow && !targetWindow.isDestroyed()) {
                targetWindow.webContents.send('thumbnail-generated', {
                    originalImgId: task.imgIdForRenderer,
                    filePath: task.filePath,
                    generatedThumbnailPath: null,
                    error: 'queue_processing_error',
                    details: error.message
                });
            }
        }
    } finally {
        console.log(`[QUEUE] FINALLY for: ${task.filePath}. Active workers before dec: ${activeThumbnailWorkers}`);
        activeThumbnailWorkers--;
        console.log(`[QUEUE] FINALLY for: ${task.filePath}. Active workers after dec: ${activeThumbnailWorkers}. Calling processThumbnailQueue recursively.`);
        processThumbnailQueue(); 
    }
}

function ensureMemosDirExists() {
    if (!fs.existsSync(MEMOS_DIR)) {
        try {
            fs.mkdirSync(MEMOS_DIR, { recursive: true });
            console.log(`Created memos directory: ${MEMOS_DIR}`);
        } catch (e) {
            console.error(`Failed to create memos directory ${MEMOS_DIR}:`, e);
        }
    }
}

function getMemoFilePath(mediaFilePath) {
    if (!mediaFilePath) return null; // Handle undefined or null input
    const mediaFilename = path.basename(mediaFilePath);
    const memoFilename = path.parse(mediaFilename).name + '.md';
    return path.join(MEMOS_DIR, memoFilename);
}

async function readMemo(mediaFilePath) {
    const memoPath = getMemoFilePath(mediaFilePath);
    if (!memoPath) return ""; // Or handle error appropriately
    try {
        if (fs.existsSync(memoPath)) {
            return await fs.promises.readFile(memoPath, 'utf8');
        }
    } catch (e) {
        console.error(`Error reading memo ${memoPath}:`, e);
    }
    return ""; // Default to empty string if no memo or error
}

async function saveMemo(mediaFilePath, content) {
    ensureMemosDirExists(); // Ensure directory exists before saving
    const memoPath = getMemoFilePath(mediaFilePath);
    if (!memoPath) throw new Error('Could not determine memo file path.'); // Or handle error
    try {
        await fs.promises.writeFile(memoPath, content, 'utf8');
        console.log(`Memo saved to ${memoPath}`);
    } catch (e) {
        console.error(`Error saving memo ${memoPath}:`, e);
        throw e; // Re-throw to be caught by IPC handler
    }
}

async function getMemosList() {
    if (!fs.existsSync(MEMOS_DIR)) {
        console.log('[MEMO LIST] Memos directory does not exist.');
        return [];
    }

    try {
        const memoMdFiles = fs.readdirSync(MEMOS_DIR).filter(file => file.endsWith('.md'));
        const memoList = [];

        for (const memoMdFile of memoMdFiles) {
            const memoFilePath = path.join(MEMOS_DIR, memoMdFile);
            let stats;
            try {
                stats = fs.statSync(memoFilePath);
            } catch (e) {
                console.error(`[MEMO LIST] Failed to get stats for ${memoFilePath}:`, e);
                continue; // Skip this file
            }

            const mediaFileBaseName = path.parse(memoMdFile).name; // e.g., "myvideo" from "myvideo.md"
            
            // Find corresponding media file in allScannedMediaFiles
            const associatedMediaFile = allScannedMediaFiles.find(
                media => path.parse(media.filePath).name === mediaFileBaseName
            );

            memoList.push({
                memoFileName: memoMdFile, // Full name like "myvideo.md"
                mediaFileBaseName: mediaFileBaseName, // Base name like "myvideo"
                mediaFilePath: associatedMediaFile ? associatedMediaFile.filePath : null,
                fileType: associatedMediaFile ? associatedMediaFile.fileType : null,
                thumbnailPath: associatedMediaFile ? associatedMediaFile.thumbnailPath : null,
                lastModifiedDate: stats.mtime // JavaScript Date object for sorting
            });
        }
        console.log(`[MEMO LIST] Found ${memoList.length} memos.`);
        return memoList;
    } catch (e) {
        console.error('[MEMO LIST] Error reading memos directory:', e);
        return [];
    }
}

const APP_NAME = appPackage.productName || "My Media Browser";
const HISTORY_LIMIT = 100; // Max number of history items to store
let allScannedMediaFiles = []; // To store all scanned media files with their details

let favoritesFilePath;
let historyFilePath;
let scannedFoldersPath;

function ensureUserDataDirExists() {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
        console.log(`Created userData directory: ${userDataPath}`);
    }
    return userDataPath;
}

function ensureFavoritesFileInitialized() {
    if (!favoritesFilePath) {
        const userDataPath = ensureUserDataDirExists();
        favoritesFilePath = path.join(userDataPath, 'favorites.json');
        console.log(`Favorites file path initialized to: ${favoritesFilePath}`);
    }
}

function ensureHistoryFileInitialized() {
    if (!historyFilePath) {
        const userDataPath = ensureUserDataDirExists();
        historyFilePath = path.join(userDataPath, 'history.json');
        console.log(`History file path initialized to: ${historyFilePath}`);
    }
}

function ensureScannedFoldersFileInitialized() {
    if (!scannedFoldersPath) {
        const userDataPath = ensureUserDataDirExists();
        scannedFoldersPath = path.join(userDataPath, 'scannedFolders.json');
        console.log(`Scanned folders file path initialized to: ${scannedFoldersPath}`);
    }
}

// Scanned Folders helper functions
function getScannedFolders() {
    ensureScannedFoldersFileInitialized();
    try {
        if (fs.existsSync(scannedFoldersPath)) {
            const fileContent = fs.readFileSync(scannedFoldersPath, 'utf8');
            if (fileContent) {
                let folders = JSON.parse(fileContent);
                // Migration logic for old string array format
                if (folders.length > 0 && typeof folders[0] === 'string') {
                    console.log('Migrating scannedFolders.json from string array to object array format.');
                    folders = folders.map(folderPath => ({ path: folderPath, recursive: true }));
                    // Note: This migrated version is not saved back immediately by getScannedFolders.
                    // It will be saved if a subsequent add/remove/toggle operation calls saveScannedFolders.
                }
                return folders; // Array of { path: string, recursive: boolean }
            }
        }
    } catch (error) {
        console.error('Error reading or parsing scannedFolders.json:', error);
    }
    return []; // Default to empty array
}

function saveScannedFolders(foldersArray) { // Expects Array<{ path: string, recursive: boolean }>
    ensureScannedFoldersFileInitialized();
    try {
        const jsonData = JSON.stringify(foldersArray, null, 2);
        fs.writeFileSync(scannedFoldersPath, jsonData, 'utf8');
        console.log('Scanned folders saved:', foldersArray);
    } catch (error) {
        console.error('Error writing scannedFolders.json:', error);
    }
}

// Favorites helper functions (using JSON file)
function getFavorites() {
    ensureFavoritesFileInitialized();
    try {
        if (fs.existsSync(favoritesFilePath)) {
            const fileContent = fs.readFileSync(favoritesFilePath, 'utf8');
            if (fileContent) {
                return JSON.parse(fileContent);
            }
        }
    } catch (error) {
        console.error('Error reading or parsing favorites.json:', error);
    }
    return []; // Default to empty array if file doesn't exist, is empty, or parsing fails
}

function saveFavorites(favoritesArray) {
    ensureFavoritesFileInitialized();
    try {
        const jsonData = JSON.stringify(favoritesArray, null, 2);
        fs.writeFileSync(favoritesFilePath, jsonData, 'utf8');
    } catch (error) {
        console.error('Error writing favorites.json:', error);
    }
}

function addFavorite(filePath) {
    const favorites = getFavorites();
    if (!favorites.includes(filePath)) {
        favorites.push(filePath);
        saveFavorites(favorites);
        console.log(`Added to favorites (JSON): ${filePath}`);
    }
}

function removeFavorite(filePath) {
    let favorites = getFavorites();
    if (favorites.includes(filePath)) {
        favorites = favorites.filter(fav => fav !== filePath);
        saveFavorites(favorites);
        console.log(`Removed from favorites (JSON): ${filePath}`);
    }
}

function isFavorite(filePath) {
    const favorites = getFavorites();
    return favorites.includes(filePath);
}

// History helper functions (using JSON file)
function getHistory() {
    ensureHistoryFileInitialized();
    try {
        if (fs.existsSync(historyFilePath)) {
            const fileContent = fs.readFileSync(historyFilePath, 'utf8');
            if (fileContent) {
                return JSON.parse(fileContent);
            }
        }
    } catch (error) {
        console.error('Error reading or parsing history.json:', error);
    }
    return [];
}

function saveHistory(historyArray) {
    ensureHistoryFileInitialized();
    try {
        const jsonData = JSON.stringify(historyArray, null, 2);
        fs.writeFileSync(historyFilePath, jsonData, 'utf8');
    } catch (error) {
        console.error('Error writing history.json:', error);
    }
}

function addHistoryItem(filePath, fileType) {
    let history = getHistory();
    // Remove existing entry for this filePath to move it to the top
    history = history.filter(item => item.filePath !== filePath);

    // Add new item to the beginning
    history.unshift({
        filePath: filePath,
        fileType: fileType,
        lastViewed: new Date().toISOString() // Store timestamp in ISO format
    });

    // Enforce history limit (ensure HISTORY_LIMIT is defined, it is from previous step)
    if (history.length > HISTORY_LIMIT) {
        history = history.slice(0, HISTORY_LIMIT);
    }

    saveHistory(history);
    console.log(`Added to history (JSON): ${filePath}, new history length: ${history.length}`);
}


function createWindow () {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Pass APP_NAME as a query parameter to index.html
  const indexPath = path.join(__dirname, 'index.html');
  const indexUrl = url.format({
      pathname: indexPath,
      protocol: 'file:',
      slashes: true,
      query: { appName: APP_NAME }
  });
  win.loadURL(indexUrl);
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  ensureMemosDirExists(); // Ensure memos directory exists on startup
  createWindow();

  // Handle app-command for mouse back/forward buttons (primarily Windows)
  app.on('app-command', (e, cmd) => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      if (cmd === 'browser-backward') {
        if (focusedWindow.webContents.canGoBack()) {
          console.log('Navigating back via app-command');
          focusedWindow.webContents.goBack();
        }
      } else if (cmd === 'browser-forward') {
        if (focusedWindow.webContents.canGoForward()) {
          console.log('Navigating forward via app-command');
          focusedWindow.webContents.goForward();
        }
      }
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle directory selection dialog
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled) {
    return null;
  } else {
    return filePaths[0];
  }
});

// New core function to load all media
async function loadAllMediaFromRegisteredFolders() {
    const foldersToScan = getScannedFolders();
    if (foldersToScan.length === 0) {
        console.log('No folders registered for scanning.');
        allScannedMediaFiles = [];
        return [];
    }

    console.log('Loading media from registered folders:', foldersToScan.map(f => `Path: ${f.path}, Recursive: ${f.recursive}`));
    let consolidatedMediaFiles = [];
    const uniqueFilePaths = new Set();

    for (const folderEntry of foldersToScan) { // folderEntry is now { path: string, recursive: boolean }
        console.log(`Scanning directory: ${folderEntry.path} (Recursive: ${folderEntry.recursive})`);
        const filesInFolder = scanDirectory(folderEntry.path, folderEntry.recursive); // Pass recursive flag
        console.log(`Found ${filesInFolder.length} media files in ${folderEntry.path}.`);

        for (const file of filesInFolder) {
            if (!uniqueFilePaths.has(file.filePath)) {
                uniqueFilePaths.add(file.filePath);
                consolidatedMediaFiles.push(file);
            }
        }
    }

    console.log(`Total unique media files found: ${consolidatedMediaFiles.length}`);

    // Process files to check for existing thumbnails and add favorite status
    const processedFiles = consolidatedMediaFiles.map(file => {
        const expectedFilename = generateExpectedThumbnailFilename(file.filePath);
        const expectedThumbnailPath = path.join(THUMBNAILS_DIR, expectedFilename);
        let thumbnailPath = null;

        if (fs.existsSync(expectedThumbnailPath)) {
            thumbnailPath = expectedThumbnailPath;
        } else {
            // console.log(`Thumbnail not found for ${file.filePath}, will need on-demand generation.`);
        }
        const favoriteStatus = isFavorite(file.filePath);
        console.log(`[LOAD_ALL_MEDIA] Processing ${file.filePath}, isFavorite: ${favoriteStatus}`);
        return {
            ...file,
            thumbnailPath: thumbnailPath, // Path if exists, null otherwise
            isFavorite: favoriteStatus // Ensure this line is setting it based on the function call
        };
    });

    allScannedMediaFiles = processedFiles;
    console.log(`Updated allScannedMediaFiles with ${allScannedMediaFiles.length} items. On-demand thumbnail generation will be used if path is null.`);

    // After allScannedMediaFiles is fully populated and processed...
    console.log('Proactively queuing missing thumbnails for background generation...');
    let proactiveQueueCount = 0;
    allScannedMediaFiles.forEach(file => {
        if (!file.thumbnailPath) { // If thumbnailPath is null or empty
            // Avoid adding if already queued by renderer recently for the same file
            const alreadyQueuedByRenderer = thumbnailQueue.some(task => task.filePath === file.filePath && task.isRendererRequest);

            if (!alreadyQueuedByRenderer) {
                thumbnailQueue.push({
                    filePath: file.filePath,
                    fileType: file.fileType,
                    isRendererRequest: false, // This is a background task
                    // No imgIdForRenderer or windowId needed for background tasks
                });
                proactiveQueueCount++;
                console.log(`[PROACTIVE QUEUE] Background task added for ${file.filePath}. New queue size: ${thumbnailQueue.length}`);
            }
        }
    });
    if (proactiveQueueCount > 0) {
        console.log(`Added ${proactiveQueueCount} items to thumbnail queue for background generation.`);
        processThumbnailQueue(); // Trigger queue processing if not already active
        console.log(`[PROACTIVE QUEUE] Called processThumbnailQueue after adding ${proactiveQueueCount} proactive items.`);
    }
    return allScannedMediaFiles; // Return the list with thumbnailPath set to existing or null
}


// Handle scan directory request (now "add and rescan all")
ipcMain.on('scan-directory', async (event, directoryPath) => {
  if (directoryPath) {
    const currentFolders = getScannedFolders(); // Array of { path: string, recursive: boolean }
    // Check if path already exists
    if (!currentFolders.some(folder => folder.path === directoryPath)) {
        currentFolders.push({ path: directoryPath, recursive: false }); // Default new folders to non-recursive
        saveScannedFolders(currentFolders);
        console.log(`Added new scan directory: ${directoryPath} (recursive by default).`); // Log message might need update too
        console.log(`Added new scan directory: ${directoryPath} (defaulting to non-recursive).`);
    } else {
        console.log(`Directory already in scan list: ${directoryPath}`);
    }
  }
  // Always reload all media from all registered folders
  const loadedFiles = await loadAllMediaFromRegisteredFolders();
  event.sender.send('media-files-loaded', loadedFiles);
});

// Handle request to open a specific media file
ipcMain.on('open-media', (event, { filePath, fileType, sourceView: rawSourceView }) => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    const sourceView = rawSourceView || 'all'; // Default to 'all'
    win.loadFile(path.join(__dirname, 'media.html'), {
      query: {
        filePath: filePath,
        fileType: fileType,
        isFavorite: isFavorite(filePath), // Pass favorite status directly
        appName: APP_NAME, // Pass app name
        sourceView: sourceView
      }
    });
  }
});

// Utility function to shuffle an array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Handle request for recommendations
ipcMain.on('get-recommendations', (event, { filePath: currentFilePath, fileType: currentFileType }) => {
  const MAX_RECOMMENDATIONS = 50; // Changed from 20 to 50
  const MAX_FROM_SAME_DIR = 7;  // Changed from 4 to 7

  if (!allScannedMediaFiles || allScannedMediaFiles.length === 0) {
    event.sender.send('recommendations-loaded', []);
    return;
  }

  let finalRecommendations = [];
  const currentFileDir = path.dirname(currentFilePath);

  // Step 1: Get files from the same directory
  let sameDirFiles = allScannedMediaFiles.filter(file => {
    return file.filePath !== currentFilePath && path.dirname(file.filePath) === currentFileDir;
  });
  shuffleArray(sameDirFiles);
  finalRecommendations = sameDirFiles.slice(0, MAX_FROM_SAME_DIR);

  // Step 2: Fill remaining slots with files from other locations
  if (finalRecommendations.length < MAX_RECOMMENDATIONS) {
    const needed = MAX_RECOMMENDATIONS - finalRecommendations.length;

    // Create a set of filePaths already included or the current one, for quick lookup
    const excludedFilePaths = new Set(finalRecommendations.map(f => f.filePath));
    excludedFilePaths.add(currentFilePath);

    let otherFiles = allScannedMediaFiles.filter(file => !excludedFilePaths.has(file.filePath));
    shuffleArray(otherFiles);

    finalRecommendations.push(...otherFiles.slice(0, needed));
  }

  console.log(`Sending ${finalRecommendations.length} varied recommendations for ${currentFilePath}`);
  event.sender.send('recommendations-loaded', finalRecommendations);
});

// Handle request for the current media list (e.g., on startup or returning to index.html)
ipcMain.on('get-current-media-list', async (event) => {
    if (!allScannedMediaFiles || allScannedMediaFiles.length === 0) {
        // If allScannedMediaFiles is empty (e.g. first app start), load them from persisted folders
        console.log('allScannedMediaFiles is empty, attempting to load from registered folders for get-current-media-list.');
        await loadAllMediaFromRegisteredFolders();
        // loadAllMediaFromRegisteredFolders updates allScannedMediaFiles internally
    } else {
        // If list exists, just ensure favorite statuses are up-to-date before sending
        console.log('Refreshing favorite status for current media list.');
        allScannedMediaFiles = allScannedMediaFiles.map(file => ({
            ...file,
            isFavorite: isFavorite(file.filePath)
        }));
        console.log(`[GET_CURRENT_MEDIA_LIST] Refreshed favorite statuses. Sending ${allScannedMediaFiles.length} items. Sample favorite status for first item (if any): ${allScannedMediaFiles.length > 0 ? allScannedMediaFiles[0].isFavorite : 'N/A'}`);
    }
    console.log(`Sending current media list of ${allScannedMediaFiles.length} items to renderer.`);
    event.sender.send('current-media-list-loaded', allScannedMediaFiles);
});

// IPC handler for removing a scanned folder
ipcMain.handle('remove-scanned-folder', async (event, folderPathToRemove) => {
    console.log(`Request to remove scanned folder: ${folderPathToRemove}`);
    let currentFolders = getScannedFolders(); // Array of { path: string, recursive: boolean }
    const initialLength = currentFolders.length;
    // Filter based on the path property of the folder objects
    currentFolders = currentFolders.filter(folder => folder.path !== folderPathToRemove);

    if (currentFolders.length < initialLength) {
        saveScannedFolders(currentFolders);
        console.log(`Removed ${folderPathToRemove}. Updated folders:`, currentFolders.map(f=>f.path));
        const loadedFiles = await loadAllMediaFromRegisteredFolders();
        return { success: true, updatedFolders: getScannedFolders(), newMediaList: loadedFiles }; // Return current state of folders
    }
    return { success: false, message: "Folder not found in list." };
});

// IPC handler for toggling favorite
ipcMain.handle('toggle-favorite', async (event, filePath) => {
  console.log(`[TOGGLE_FAVORITE] Request for: ${filePath}. Current isFavorite: ${isFavorite(filePath)}`);
  let newIsFavoriteStatus;
  if (isFavorite(filePath)) {
    console.log(`[TOGGLE_FAVORITE] Removing favorite for: ${filePath}`);
    removeFavorite(filePath);
    newIsFavoriteStatus = false; // New status: not favorite
  } else {
    console.log(`[TOGGLE_FAVORITE] Adding favorite for: ${filePath}`);
    addFavorite(filePath);
    newIsFavoriteStatus = true; // New status: favorite
  }

  const fileIndex = allScannedMediaFiles.findIndex(file => file.filePath === filePath);
  if (fileIndex !== -1) {
    allScannedMediaFiles[fileIndex].isFavorite = newIsFavoriteStatus; // Use the determined new status
    console.log(`Updated isFavorite status in allScannedMediaFiles for ${filePath} to ${allScannedMediaFiles[fileIndex].isFavorite}`);
    console.log(`[TOGGLE_FAVORITE] Successfully updated favorite status for ${filePath} to ${allScannedMediaFiles[fileIndex].isFavorite}. Returning this status to renderer.`);
  }

  return newIsFavoriteStatus; // Return the new favorite status
});

// IPC handler for adding to history
ipcMain.on('add-to-history', (event, { filePath, fileType }) => {
    if (filePath && fileType) {
        addHistoryItem(filePath, fileType);
    } else {
        console.warn('Attempted to add to history with invalid filePath or fileType.');
    }
});

// IPC handler for getting the list of scanned folders
ipcMain.handle('get-scanned-folders', async () => {
    return getScannedFolders();
});

// IPC handler for getting history items
ipcMain.handle('get-history-items', async () => {
    const rawHistory = getHistory(); // Gets { filePath, fileType, lastViewed }
    if (!allScannedMediaFiles || allScannedMediaFiles.length === 0) {
        // If we don't have the main media list, we can't easily get thumbnails.
        // Send raw history, renderer can display placeholders or just file paths.
        console.warn('get-history-items: allScannedMediaFiles is empty. History items may lack thumbnails.');
        return rawHistory.map(item => ({ ...item, thumbnailPath: null, isFavorite: isFavorite(item.filePath) }));
    }

    const augmentedHistory = rawHistory.map(historyItem => {
        const scannedFile = allScannedMediaFiles.find(sf => sf.filePath === historyItem.filePath);
        return {
            ...historyItem,
            thumbnailPath: scannedFile ? scannedFile.thumbnailPath : null,
            // isFavorite status is already part of allScannedMediaFiles, but ensure it's current
            isFavorite: scannedFile ? isFavorite(historyItem.filePath) : isFavorite(historyItem.filePath)
        };
    });
    console.log(`Returning ${augmentedHistory.length} augmented history items.`);
    return augmentedHistory;
});


// Handle master volume changes
ipcMain.on('master-volume-changed', (event, newVolume) => {
  console.log(`Master volume changed to ${newVolume}, broadcasting to all windows.`);
  // Broadcast to all windows
  BrowserWindow.getAllWindows().forEach(win => {
    // Optionally, you could check if the window is media.html or if it's not the sender
    // if (win.webContents !== event.sender) { // Avoid sending back to the source if not needed
    // }
    win.webContents.send('apply-master-volume', newVolume);
  });
});

// IPC handler for toggling recursive scan option for a folder
ipcMain.handle('toggle-recursive-scan', async (event, { folderPath, recursive }) => {
    try {
        let folders = getScannedFolders(); // Array of {path, recursive}
        const folderIndex = folders.findIndex(f => f.path === folderPath);

        if (folderIndex === -1) {
            console.error(`Folder not found for toggling recursive scan: ${folderPath}`);
            return { success: false, message: 'Folder not found.' };
        }

        folders[folderIndex].recursive = !!recursive; // Ensure boolean
        saveScannedFolders(folders);
        console.log(`Recursive scan for ${folderPath} set to ${folders[folderIndex].recursive}.`);

        // After changing the option, reload all media as the content might change
        const updatedMedia = await loadAllMediaFromRegisteredFolders(); // This updates allScannedMediaFiles

        return { success: true, updatedMedia: updatedMedia, updatedFolders: getScannedFolders() };
    } catch (error) {
        console.error('Error toggling recursive scan:', error);
        return { success: false, message: error.message || 'Failed to update scan option.' };
    }
});

// New IPC handler for queuing thumbnail requests
ipcMain.on('request-thumbnail', (event, { filePath, fileType, imgIdForRenderer }) => {
    // Ensure we have a valid windowId to send the response back to.
    // event.sender is the webContents that sent the message.
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    if (!ownerWindow) {
        console.warn(`Could not find owner window for request-thumbnail from sender ID: ${event.sender.id}. File: ${filePath}`);
        return; // Cannot process if we can't identify the window to reply to
    }
    const windowId = ownerWindow.id;

    // Add to queue with renderer request context
    thumbnailQueue.push({
        filePath,
        fileType,
        imgIdForRenderer,
        windowId, // ID of the window that made the request
        isRendererRequest: true 
    });
    console.log(`[IPC ON request-thumbnail] Task added for ${filePath}. New queue size: ${thumbnailQueue.length}`);
    processThumbnailQueue(); // Trigger queue processing
    console.log(`[IPC ON request-thumbnail] Called processThumbnailQueue for ${filePath}.`);
});

ipcMain.handle('get-memo', async (event, mediaFilePath) => {
    if (!mediaFilePath) {
        console.error('[IPC get-memo] Received request with no mediaFilePath.');
        return ""; // Or throw an error / return specific error object
    }
    try {
        return await readMemo(mediaFilePath);
    } catch (e) {
        console.error(`[IPC get-memo] Error reading memo for ${mediaFilePath}:`, e);
        return ""; // Return empty string or an error indicator
    }
});

ipcMain.handle('save-memo', async (event, { mediaFilePath, content }) => {
    if (!mediaFilePath) {
        console.error('[IPC save-memo] Received request with no mediaFilePath.');
        return { success: false, error: 'No mediaFilePath provided.' };
    }
    if (typeof content !== 'string') {
        // Ensure content is a string, even if empty, to avoid write errors.
        content = String(content || ""); 
    }
    try {
        await saveMemo(mediaFilePath, content);
        return { success: true };
    } catch (e) {
        console.error(`[IPC save-memo] Error saving memo for ${mediaFilePath}:`, e);
        return { success: false, error: e.message || 'Failed to save memo.' };
    }
});

ipcMain.handle('get-memos-list', async () => {
    try {
        return await getMemosList();
    } catch (e) {
        console.error('[IPC get-memos-list] Error calling getMemosList:', e);
        return []; // Return empty list or an error structure
    }
});

ipcMain.on('background-color-changed', (event, newColor) => {
    // Broadcast to all other windows
    BrowserWindow.getAllWindows().forEach(win => {
        if (win.webContents !== event.sender) {
            win.webContents.send('apply-background-color', newColor);
        }
    });
});

ipcMain.on('open-external-link', (event, url) => {
  console.log(`[IPC_OPEN_EXTERNAL] Received request to open URL: ${url}`);
  if (typeof url !== 'string') {
    console.error('[IPC_OPEN_EXTERNAL] Invalid URL received: not a string.', url);
    return;
  }

  // Basic URL validation: only allow http and https protocols
  if (url.startsWith('http:') || url.startsWith('https:')) {
    shell.openExternal(url)
      .then(() => {
        console.log(`[IPC_OPEN_EXTERNAL] Successfully opened URL: ${url}`);
      })
      .catch(err => {
        console.error(`[IPC_OPEN_EXTERNAL] Failed to open URL: ${url}. Error: ${err}`);
      });
  } else {
    console.warn(`[IPC_OPEN_EXTERNAL] Blocked attempt to open non-http/https URL: ${url}`);
  }
});
