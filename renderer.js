const selectDirBtn = document.getElementById('select-dir-btn');
const mediaGrid = document.getElementById('media-grid');
const statusMessage = document.getElementById('status-message');
const masterVolumeSlider = document.getElementById('master-volume');
const toggleFavoritesViewBtn = document.getElementById('toggle-favorites-view');
const toggleHistoryViewBtn = document.getElementById('toggle-history-view');
const manageFoldersBtn = document.getElementById('manage-folders-btn');
const manageFoldersModal = document.getElementById('manage-folders-modal');
const modalCloseBtn = manageFoldersModal.querySelector('.modal-close-btn');
const registeredFoldersList = document.getElementById('registered-folders-list');
const modalStatusMessage = document.getElementById('modal-status-message');
const backgroundColorPicker = document.getElementById('background-color-picker');

const DEFAULT_BACKGROUND_COLOR = '#f0f0f0'; // Match initial CSS body background
const BACKGROUND_COLOR_STORAGE_KEY = 'appBackgroundColor';

let currentAllMediaItems = []; // Store the full list of media items
let showingOnlyFavorites = false;
let showingOnlyHistory = false;

// Initialize and handle master volume
function applyBackgroundColor(color) {
    document.body.style.backgroundColor = color;
}

function initializeVolume() {
    // ... (existing volume init code)
    const savedVolume = localStorage.getItem('masterVolume');
    let currentVolume = 0.5; // Default volume
    if (savedVolume !== null) {
        currentVolume = parseFloat(savedVolume);
    }
    if (masterVolumeSlider) masterVolumeSlider.value = currentVolume;
}

if (masterVolumeSlider) { // Guard event listener attachment
    masterVolumeSlider.addEventListener('input', () => {
        const newVolume = parseFloat(masterVolumeSlider.value);
        localStorage.setItem('masterVolume', newVolume.toString());
        console.log(`Master volume changed to: ${newVolume}`);
        if (window.electronAPI) {
            window.electronAPI.send('master-volume-changed', newVolume);
        }
    });
} else {
    console.warn("Master volume slider not found.");
}

// Guard other top-level listeners similarly for robustness, though already checked
if (selectDirBtn) {
    selectDirBtn.addEventListener('click', async () => {
        // mediaGrid.innerHTML = ''; // Clearing grid here might be too early if user cancels.
        // statusMessage.textContent = 'Scanning directory...'; // Also potentially premature.

        // The following lines for clearing grid and setting status are moved to after path is confirmed.
        // This was the previous logic:
        // mediaGrid.innerHTML = '';
        // statusMessage.textContent = 'Scanning directory...';
        try {
            const directoryPath = await window.electronAPI.invoke('dialog:openDirectory');
            if (directoryPath) {
                // User selected a directory
                mediaGrid.innerHTML = ''; // Clear grid now that we are proceeding
                statusMessage.textContent = `Adding '${directoryPath}' and refreshing media from all registered folders... Please wait. This might take a while.`;
                console.log(`Selected directory: ${directoryPath}, sending to main process.`);
                window.electronAPI.send('scan-directory', directoryPath);
            } else {
                // User cancelled the dialog or no path was returned
                // Only update status if no media is currently shown, or revert to previous.
                if (currentAllMediaItems.length === 0) { // Check if grid was already empty
                    statusMessage.textContent = 'No directory selected or operation cancelled.';
                } else {
                     // Optional: Or let existing content and status message persist.
                    console.log('Directory selection cancelled, existing media list retained.');
                }
            }
        } catch (error) {
            console.error('Error selecting directory:', error);
            statusMessage.textContent = `Error selecting directory: ${error.message}`;
        }
    });
} else {
    console.warn("Select directory button not found.");
}

if (toggleFavoritesViewBtn) {
    toggleFavoritesViewBtn.addEventListener('click', () => {
        // ... (existing code) ...
    });
} else {
    console.warn("Toggle favorites button not found.");
}

if (toggleHistoryViewBtn) {
    toggleHistoryViewBtn.addEventListener('click', async () => {
        // ... (existing code) ...
    });
} else {
    console.warn("Toggle history button not found.");
}

// Corrected: The erroneous populateMediaGrid definition (lines 45-55) is removed.
// The correct definition below (previously starting at line 57) is now the active one.

function populateMediaGrid(filesToDisplay, messagePrefix = "Found") {
    mediaGrid.innerHTML = ''; // Clear existing grid

    if (!filesToDisplay || filesToDisplay.length === 0) {
        if (showingOnlyHistory) {
            statusMessage.textContent = 'No items in history. View some media to populate history.';
        } else if (showingOnlyFavorites) {
            statusMessage.textContent = 'No favorite items found. Click "Show All" to see all media or mark some items as favorites.';
        } else if (messagePrefix === "Found" || messagePrefix === "Loaded" || messagePrefix === "Displaying") {
            statusMessage.textContent = 'No media files found. Select a directory to scan.';
        } else {
            statusMessage.textContent = 'Select a directory to view media.';
        }
        return;
    }

    let currentViewMessage = `${messagePrefix} ${filesToDisplay.length} media items.`;
    if (showingOnlyFavorites) {
        currentViewMessage += ' (Showing Favorites)';
    } else if (showingOnlyHistory) {
        currentViewMessage += ' (Showing History - Most Recent First)';
    }
    statusMessage.textContent = currentViewMessage;


    filesToDisplay.forEach((file, index) => { // Added index for unique ID generation if needed later
        try { // Start of try block for each file item
            if (!file || typeof file.filePath !== 'string') {
                console.error('Skipping invalid file object during grid population:', file);
                return; // Skip this iteration
            }

            const displayFileName = file.filePath.split(/\/|\\/).pop() || 'Unnamed File';

            const item = document.createElement('div');
            item.classList.add('media-item');
            item.setAttribute('data-filepath', file.filePath);
            item.setAttribute('data-filetype', file.fileType);

            const favButton = document.createElement('button');
        favButton.classList.add('favorite-btn');
        favButton.innerHTML = file.isFavorite ? '★' : '☆'; // Filled star if favorite, outline if not
        favButton.setAttribute('aria-label', file.isFavorite ? 'Unmark as favorite' : 'Mark as favorite');

        favButton.addEventListener('click', async (e) => {
            e.stopPropagation(); // Prevent triggering media item click
            const filePath = file.filePath; // Ensure filePath is captured correctly
            console.log(`Toggling favorite for: ${filePath}`);
            try {
                const newIsFavorite = await window.electronAPI.invoke('toggle-favorite', filePath);
                favButton.innerHTML = newIsFavorite ? '★' : '☆';
                favButton.setAttribute('aria-label', newIsFavorite ? 'Unmark as favorite' : 'Mark as favorite');

                // Update the status in the master list
                const masterListItem = currentAllMediaItems.find(item => item.filePath === filePath);
                if (masterListItem) {
                    masterListItem.isFavorite = newIsFavorite;
                }
                file.isFavorite = newIsFavorite; // Also update the item in the potentially filtered list

                console.log(`New favorite status for ${filePath}: ${newIsFavorite}`);

                // If showing only favorites and an item is un-favorited, re-render the grid
                if (showingOnlyFavorites && !newIsFavorite) {
                    renderMediaGrid();
                }
            } catch (error) {
                console.error('Error toggling favorite:', error);
            }
        });
        item.appendChild(favButton);

        const img = document.createElement('img');
        // Use index from forEach for a unique ID. filesToDisplay is the array being iterated.
        const uniqueImgId = `thumb-img-${filesToDisplay.indexOf(file)}-${Date.now()}`; // Add timestamp for more uniqueness if list re-renders fast
        img.id = uniqueImgId;

        if (file.thumbnailPath) {
            img.src = `file://${file.thumbnailPath}`; // Assuming thumbnailPath is already a full, valid path
            img.alt = displayFileName;
        } else {
            img.classList.add('thumbnail-loading');
            img.alt = "Loading thumbnail...";

            (async () => {
                try {
                    if (!window.electronAPI) {
                        console.error("electronAPI not found for on-demand thumbnail for file:", file.filePath);
                        throw new Error("electronAPI not available");
                    }
                    const response = await window.electronAPI.invoke('get-thumbnail-for-file', {
                        filePath: file.filePath,
                        fileType: file.fileType,
                        imgIdForRenderer: uniqueImgId
                    });

                    const imgToUpdate = document.getElementById(response.originalImgId);
                    if (imgToUpdate) {
                        imgToUpdate.classList.remove('thumbnail-loading');
                        // Remove any existing message overlay before adding a new one or setting src
                        const existingMsg = imgToUpdate.parentElement?.querySelector('.thumbnail-message-overlay');
                        if (existingMsg) existingMsg.remove();

                        if (response.error === 'video_corrupt_or_unreadable') {
                            imgToUpdate.classList.add('thumbnail-error');
                            imgToUpdate.alt = 'Video corrupt or unreadable';
                            if (imgToUpdate.parentElement) {
                                const errorMsgElement = document.createElement('div');
                                errorMsgElement.className = 'thumbnail-message-overlay';
                                errorMsgElement.textContent = 'Video Corrupt';
                                imgToUpdate.parentElement.appendChild(errorMsgElement);
                            }
                        } else if (response.error || !response.generatedThumbnailPath) {
                            imgToUpdate.classList.add('thumbnail-error');
                            imgToUpdate.alt = response.error ? `Error: ${response.error}` : `Thumbnail error: ${response.errorDetails || 'Generation failed'}`;
                            console.error(`Thumbnail generation failed for ${file.filePath}:`, response.error, response.errorDetails);
                        } else { // Success
                            imgToUpdate.src = `file://${response.generatedThumbnailPath}`;
                            imgToUpdate.alt = displayFileName;
                        }
                    }
                } catch (error) {
                    console.error('Error in on-demand thumbnail IIFE for', file.filePath, error);
                    const imgToUpdateOnError = document.getElementById(uniqueImgId);
                    if (imgToUpdateOnError) {
                        const parent = imgToUpdateOnError.parentElement;
                        if (parent) { // Remove previous overlay if any
                           const existingMsg = parent.querySelector('.thumbnail-message-overlay');
                           if (existingMsg) existingMsg.remove();
                        }
                        imgToUpdateOnError.classList.remove('thumbnail-loading');
                        imgToUpdateOnError.classList.add('thumbnail-error');
                        imgToUpdateOnError.alt = "Error triggering thumbnail load";
                    }
                }
            })();
        }

        img.onerror = function() {
            if (!this.classList.contains('thumbnail-error') && !this.classList.contains('thumbnail-loading')) {
                console.error(`Error loading image src: ${this.src}`); // this.src might be empty if it never loaded
                this.classList.add('thumbnail-error');
                this.alt = 'Failed to load image';
                // Remove any potential message overlay if a generic load error occurs after attempting to set src
                const parent = this.parentElement;
                if (parent) {
                    const existingMsg = parent.querySelector('.thumbnail-message-overlay');
                    if (existingMsg) existingMsg.remove();
                }
            }
        };

        const filenamePara = document.createElement('p');
        filenamePara.textContent = displayFileName;

        item.appendChild(img);
        item.appendChild(filenamePara); // Use renamed variable

        item.addEventListener('click', () => {
            if (file && file.filePath && file.fileType) { // Guard access to file properties
                console.log(`Requesting to open media: ${file.fileType} - ${file.filePath}`);
                window.electronAPI.send('open-media', { filePath: file.filePath, fileType: file.fileType });
            } else {
                console.error('Cannot open media: file data is incomplete.', file);
            }
        });
        mediaGrid.appendChild(item);

        } catch (error) { // End of try block for each file item
            console.error('Error processing media item for grid display:', file, error);
            // Optionally, append an error placeholder item to the grid or just skip.
        }
    });
}

selectDirBtn.addEventListener('click', async () => {
    mediaGrid.innerHTML = '';
    statusMessage.textContent = 'Scanning directory...';
    try {
        const directoryPath = await window.electronAPI.invoke('dialog:openDirectory');
        if (directoryPath) {
            statusMessage.textContent = `Scanning ${directoryPath}... please wait. This might take a while for large directories.`;
            console.log(`Selected directory: ${directoryPath}`);
            window.electronAPI.send('scan-directory', directoryPath);
        } else {
            statusMessage.textContent = 'No directory selected. Previous media list (if any) retained.';
            // If a previous list was loaded, it will remain. If not, grid is empty.
            // To explicitly re-load or ensure message consistency:
            // window.electronAPI.send('get-current-media-list');
            // For now, do nothing, let existing grid (if any) persist or stay empty.
        }
    } catch (error) {
        console.error('Error selecting directory:', error);
        statusMessage.textContent = `Error: ${error.message}`;
    }
});

// Function to decide what to render based on the current filter
async function renderMediaGrid() { // Made async to handle potential await for history
    let itemsToDisplay = currentAllMediaItems; // Default to all items
    let messagePrefix = "Loaded";

    if (showingOnlyHistory) {
        if (window.electronAPI) {
            try {
                console.log('Requesting history items...');
                itemsToDisplay = await window.electronAPI.invoke('get-history-items');
                messagePrefix = "Displaying";
            } catch (error) {
                console.error('Error fetching history items:', error);
                statusMessage.textContent = 'Error loading history.';
                itemsToDisplay = []; // Show empty on error
            }
        } else {
            itemsToDisplay = []; // Should not happen if API is available
        }
    } else if (showingOnlyFavorites) {
        itemsToDisplay = currentAllMediaItems.filter(file => file.isFavorite);
        messagePrefix = "Displaying";
    }

    populateMediaGrid(itemsToDisplay, messagePrefix);
}

// Event listener for the toggle favorites view button
toggleFavoritesViewBtn.addEventListener('click', () => {
    showingOnlyFavorites = !showingOnlyFavorites;
    if (showingOnlyFavorites) {
        showingOnlyHistory = false; // Deactivate history view if activating favorites view
        toggleHistoryViewBtn.textContent = 'Show History';
    }
    toggleFavoritesViewBtn.textContent = showingOnlyFavorites ? 'Show All Media' : 'Show Favorites';
    renderMediaGrid();
});

// Event listener for the toggle history view button
toggleHistoryViewBtn.addEventListener('click', async () => {
    showingOnlyHistory = !showingOnlyHistory;
    if (showingOnlyHistory) {
        showingOnlyFavorites = false; // Deactivate favorites view if activating history view
        toggleFavoritesViewBtn.textContent = 'Show Favorites';
    }
    toggleHistoryViewBtn.textContent = showingOnlyHistory ? 'Show All Media' : 'Show History';
    await renderMediaGrid(); // Await because it might fetch history
});

// Listener for newly scanned files
window.electronAPI.on('media-files-loaded', (files) => {
    console.log('Received newly scanned media files:', files);
    currentAllMediaItems = files; // Store the full list
    renderMediaGrid(); // Render based on current filter
});

// Listener for currently stored media list on page load
window.electronAPI.on('current-media-list-loaded', (files) => {
    console.log('Received current media list from main process:', files);
    currentAllMediaItems = files; // Store the full list
    renderMediaGrid(); // Render based on current filter
});

// On DOMContentLoaded, request the current media list
document.addEventListener('DOMContentLoaded', () => {
    initializeVolume();
    if(toggleFavoritesViewBtn) toggleFavoritesViewBtn.textContent = showingOnlyFavorites ? 'Show All Media' : 'Show Favorites';
    if(toggleHistoryViewBtn) toggleHistoryViewBtn.textContent = showingOnlyHistory ? 'Show All Media' : 'Show History';

    // Initialize Background Color
    if (backgroundColorPicker) {
        const savedColor = localStorage.getItem(BACKGROUND_COLOR_STORAGE_KEY);
        const initialColor = savedColor || DEFAULT_BACKGROUND_COLOR;
        applyBackgroundColor(initialColor);
        backgroundColorPicker.value = initialColor;

        backgroundColorPicker.addEventListener('input', (event) => {
            const newColor = event.target.value;
            applyBackgroundColor(newColor);
            localStorage.setItem(BACKGROUND_COLOR_STORAGE_KEY, newColor);
            if (window.electronAPI) {
                window.electronAPI.send('background-color-changed', newColor);
            }
        });
    } else {
        console.warn("Background color picker not found.");
    }


    // Get App Name from query params and set header
    const params = new URLSearchParams(window.location.search);
    const appName = params.get('appName') || "My Media Browser"; // Fallback
    const appTitleHeader = document.getElementById('app-title-header');
    if (appTitleHeader) {
        appTitleHeader.textContent = appName;
        appTitleHeader.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // Modal event listeners
    if (manageFoldersBtn) { // Ensure button exists
        manageFoldersBtn.addEventListener('click', async () => {
            if (window.electronAPI) {
                try {
                    modalStatusMessage.textContent = ''; // Clear previous messages
                    const folders = await window.electronAPI.invoke('get-scanned-folders');
                    displayRegisteredFolders(folders);
                    manageFoldersModal.style.display = 'block';
                } catch (error) {
                    console.error('Error fetching scanned folders:', error);
                    modalStatusMessage.textContent = 'Error loading folder list.';
                    displayRegisteredFolders([]); // Display empty list on error
                    manageFoldersModal.style.display = 'block';
                }
            }
        });
    }

    if (modalCloseBtn) { // Ensure button exists
        modalCloseBtn.addEventListener('click', () => {
            manageFoldersModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (event) => { // Click outside modal to close
        if (event.target == manageFoldersModal) {
            manageFoldersModal.style.display = 'none';
        }
    });

    if (window.electronAPI) {
        console.log('Requesting current media list from main process...');
        window.electronAPI.send('get-current-media-list');
    }
});

// Helper function to display registered folders in the modal
function displayRegisteredFolders(foldersArray) {
    registeredFoldersList.innerHTML = ''; // Clear existing list

    if (!foldersArray || foldersArray.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No folders have been added yet. Add one using the "Select Media Directory" button.';
        registeredFoldersList.appendChild(li);
        return;
    }

    foldersArray.forEach(folderEntry => { // folderEntry is now { path: string, recursive: boolean }
        const li = document.createElement('li');

        const pathSpan = document.createElement('span');
        pathSpan.textContent = folderEntry.path;
        // li.appendChild(pathSpan); // Path will be part of a container for better layout with checkbox

        const recursiveToggleLabel = document.createElement('label');
        recursiveToggleLabel.classList.add('recursive-toggle');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.classList.add('recursive-scan-checkbox');
        checkbox.checked = folderEntry.recursive;
        checkbox.setAttribute('data-folderpath', folderEntry.path);

        checkbox.addEventListener('change', async (event) => {
            const path = event.target.dataset.folderpath;
            const isRecursive = event.target.checked;

            event.target.disabled = true;
            checkbox.parentElement.style.opacity = 0.5; // Visual feedback
            modalStatusMessage.textContent = `Updating scan option for ${path}...`;

            try {
                const response = await window.electronAPI.invoke('toggle-recursive-scan', { folderPath: path, recursive: isRecursive });
                if (response.success) {
                    currentAllMediaItems = response.updatedMedia;
                    await renderMediaGrid(); // Refresh main grid
                    displayRegisteredFolders(response.updatedFolders); // Re-render the modal's folder list
                    modalStatusMessage.textContent = 'Scan option updated. Media library refreshed.';
                    // No longer need to manually update folderEntry.recursive as the list is re-rendered
                } else {
                    throw new Error(response.message || 'Failed to update scan option.');
                }
            } catch (err) {
                modalStatusMessage.textContent = `Error: ${err.message}`;
                console.error(err);
                event.target.checked = !isRecursive; // Revert checkbox on error
            } finally {
                event.target.disabled = false;
                checkbox.parentElement.style.opacity = 1;
                setTimeout(() => {
                    if (modalStatusMessage.textContent.startsWith('Scan option updated') || modalStatusMessage.textContent.startsWith('Error:')) {
                        modalStatusMessage.textContent = '';
                    }
                }, 3000);
            }
        });

        recursiveToggleLabel.appendChild(checkbox);
        recursiveToggleLabel.appendChild(document.createTextNode(' Scan Subfolders'));

        // Layout: Checkbox | Path | Remove Button
        li.appendChild(recursiveToggleLabel);
        li.appendChild(pathSpan); // pathSpan defined above

        const removeBtn = document.createElement('button');
        removeBtn.classList.add('remove-folder-btn');
        removeBtn.textContent = 'Remove';
        removeBtn.setAttribute('data-folderpath', folderEntry.path);

        removeBtn.addEventListener('click', async (e) => {
            const pathToRemove = e.target.getAttribute('data-folderpath');
            if (!pathToRemove) return;

            // Disable both buttons for this item
            removeBtn.disabled = true;
            checkbox.disabled = true;
            li.style.opacity = 0.5;
            modalStatusMessage.textContent = `Attempting to remove folder: ${pathToRemove}...`;

            try {
                const response = await window.electronAPI.invoke('remove-scanned-folder', pathToRemove);
                if (response.success) {
                    modalStatusMessage.textContent = `Folder "${pathToRemove}" removed. Library updating...`;
                    displayRegisteredFolders(response.updatedFolders); // Re-render the modal list
                    currentAllMediaItems = response.updatedMedia;
                    await renderMediaGrid();
                    setTimeout(() => {
                        if (modalStatusMessage.textContent.startsWith(`Folder "${pathToRemove}" removed`)) {
                            modalStatusMessage.textContent = '';
                        }
                    }, 3000);
                } else {
                    modalStatusMessage.textContent = `Error removing folder: ${response.message || 'Unknown error'}`;
                    removeBtn.disabled = false;
                    checkbox.disabled = false;
                    li.style.opacity = 1;
                    removeBtn.textContent = 'Remove';
                }
            } catch (error) {
                console.error('Error invoking remove-scanned-folder:', error);
                modalStatusMessage.textContent = `Error: ${error.message || 'Failed to communicate with main process.'}`;
                removeBtn.disabled = false;
                checkbox.disabled = false;
                li.style.opacity = 1;
                removeBtn.textContent = 'Remove';
            }
        });

        li.appendChild(removeBtn);
        registeredFoldersList.appendChild(li);
    });
}
