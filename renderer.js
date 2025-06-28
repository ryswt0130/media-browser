// Declare DOM element variables
let selectDirBtn;
let mediaGrid;
let statusMessage;
let masterVolumeSlider;
let toggleFavoritesViewBtn;
let toggleHistoryViewBtn;
let manageFoldersBtn;
let manageFoldersModal;
let modalCloseBtn; // Dependent on manageFoldersModal
let registeredFoldersList;
let modalStatusMessage;
let backgroundColorPicker;
let appTitleHeader; // Added for completeness, though its logic is already in DOMContentLoaded
let searchInput = null; // For search functionality
let toggleMemoListViewBtn = null;
let memoSortControls = null;
let memoSortSelect = null;
let refreshLibraryBtn;

const DEFAULT_BACKGROUND_COLOR = '#f0f0f0'; // Match initial CSS body background
const BACKGROUND_COLOR_STORAGE_KEY = 'appBackgroundColor';

let currentAllMediaItems = []; // Store the full list of media items
let showingOnlyFavorites = false;
let showingOnlyHistory = false;
let showingOnlyMemos = false;
let currentMemoSort = 'mtime_desc'; // Default sort

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

// REMOVING TOP-LEVEL EVENT LISTENERS HERE - THEY WILL BE MOVED INTO DOMContentLoaded

// Corrected: The erroneous populateMediaGrid definition (lines 45-55) is removed.
// The correct definition below (previously starting at line 57) is now the active one.

function populateMediaGrid(filesToDisplay, messagePrefix = "Found", isMemoView = false) {
    mediaGrid.innerHTML = ''; // Clear existing grid

    // Status message handling is now more complex due to search, so primary "no items" will be set by renderMediaGrid if search is active
    // This block now primarily handles cases where the base view itself is empty *before* search.
    if (!filesToDisplay || filesToDisplay.length === 0) {
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
        if (!searchTerm) { // Only set these if not overridden by search-specific "no results" messages
            if (isMemoView) {
                statusMessage.textContent = 'No memos found. Create some by viewing media!';
            } else if (showingOnlyHistory) {
                statusMessage.textContent = 'No items in history. View some media to populate history.';
            } else if (showingOnlyFavorites) {
                statusMessage.textContent = 'No favorite items found. Click "Show All" to see all media or mark some items as favorites.';
            } else if (messagePrefix === "Found" || messagePrefix === "Loaded" || messagePrefix === "Displaying") {
                statusMessage.textContent = 'No media files found. Select a directory to scan.';
            } else {
                statusMessage.textContent = 'Select a directory to view media.';
            }
        }
        // If searchTerm is active and led to empty filesToDisplay, renderMediaGrid should have set the message.
        return;
    }

    // If there are items, but statusMessage was set to a "no items matching search" type message by renderMediaGrid,
    // we might want to update it here. Or, ensure renderMediaGrid's search message is final.
    // For now, let's assume renderMediaGrid's message is fine if search led to empty.
    // If search did NOT lead to empty, then we construct the normal message:
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (!searchTerm || (searchTerm && filesToDisplay.length > 0)) {
        let currentViewMessage = `${messagePrefix} ${filesToDisplay.length} ${isMemoView ? 'memo(s)' : 'media items'}.`;
        if (showingOnlyFavorites) {
            currentViewMessage += ' (Showing Favorites)';
        } else if (showingOnlyHistory) {
            currentViewMessage += ' (Showing History - Most Recent First)';
        } else if (isMemoView) {
            currentViewMessage += ` (Showing Memos - Sorted by ${currentMemoSort === 'mtime_desc' ? 'Newest' : 'Oldest'})`;
        }
        if (searchTerm) {
            currentViewMessage += ` (Search: "${searchTerm}")`;
        }
        statusMessage.textContent = currentViewMessage;
    }
    // If searchTerm is active and filesToDisplay is empty, statusMessage is already set by renderMediaGrid.


    filesToDisplay.forEach((file, index) => {
        try {
            const itemData = file;
            // New Log 1: Log the item being processed
            console.log(`%c[DEBUG_POPULATE] Processing item [${index}]:`, 'color: teal;', itemData); // Logs the whole object

            // New Log 2: Log before the if/else condition
            console.log(`%c[DEBUG_POPULATE] For item [${index}], isMemoView: ${isMemoView}, itemData.filePath: ${itemData.filePath}`, 'color: brown;');

            const item = document.createElement('div');
            item.classList.add('media-item');
            
            let displayFileName;
            let uniqueImgIdBase;

            if (isMemoView) { // Note: isMemoView is passed to populateMediaGrid
                item.classList.add('memo-list-item');
                if (!itemData || !itemData.memoFileName || !itemData.mediaFileBaseName) {
                    console.error('Skipping invalid memo object:', itemData);
                    return;
                }
                displayFileName = itemData.mediaFileBaseName || itemData.memoFileName;
                item.setAttribute('data-filepath', itemData.mediaFilePath || itemData.memoFileName); 
                item.setAttribute('data-filetype', itemData.fileType || 'memo');
                uniqueImgIdBase = itemData.mediaFilePath || itemData.memoFileName;

                // Image for memo (placeholder or associated media thumb)
                const img = document.createElement('img');
                const uniqueImgId = `thumb-img-${uniqueImgIdBase.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
                img.id = uniqueImgId;
                if (itemData.thumbnailPath) {
                    img.src = `file://${itemData.thumbnailPath}`;
                    img.alt = displayFileName;
                } else {
                    img.classList.add('thumbnail-placeholder');
                    img.alt = `Memo: ${displayFileName} (No Preview Available)`;
                }
                img.onerror = function() { /* existing onerror logic */ };
                item.appendChild(img);

                const filenamePara = document.createElement('p');
                filenamePara.textContent = displayFileName;
                item.appendChild(filenamePara);

                const datePara = document.createElement('p');
                datePara.classList.add('memo-item-date'); 
                datePara.textContent = `Modified: ${new Date(itemData.lastModifiedDate).toLocaleDateString()} ${new Date(itemData.lastModifiedDate).toLocaleTimeString()}`;
                item.appendChild(datePara);

                item.addEventListener('click', () => {
                    if (itemData.mediaFilePath && itemData.fileType) {
                        window.electronAPI.send('open-media', { 
                            filePath: itemData.mediaFilePath, 
                            fileType: itemData.fileType,
                        });
                    } else {
                        console.warn('[MEMO LIST CLICK] Cannot open media, path or type missing for memo:', itemData);
                        alert('Associated media file not found or type is unknown. Cannot open.');
                    }
                });
            } else { // Standard media file
                if (!itemData || typeof itemData.filePath !== 'string') {
                    console.error('[POPULATE_GRID_ERROR] Skipping invalid media file object (filePath issue):', itemData);
                    return;
                }
                displayFileName = itemData.filePath.split(/\/|\\/).pop() || 'Unnamed File';
                item.setAttribute('data-filepath', itemData.filePath);
                item.setAttribute('data-filetype', itemData.fileType);
                uniqueImgIdBase = itemData.filePath;

                const img = document.createElement('img');
                const uniqueImgId = `thumb-img-${uniqueImgIdBase.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
                img.id = uniqueImgId;

                if (itemData.thumbnailPath) {
                    img.src = `file://${itemData.thumbnailPath}`;
                    img.alt = displayFileName;
                } else { // Standard media file missing thumbnail
                    img.classList.add('thumbnail-loading');
                    img.alt = "Loading thumbnail...";
                    (async () => {
                        try {
                            if (!window.electronAPI) {
                                console.error("electronAPI not found for on-demand thumbnail for file:", itemData.filePath);
                                img.alt = "API Error";
                                img.classList.remove('thumbnail-loading');
                                img.classList.add('thumbnail-error');
                                return;
                            }
                            window.electronAPI.send('request-thumbnail', {
                                filePath: itemData.filePath,
                                fileType: itemData.fileType,
                                imgIdForRenderer: uniqueImgId
                            });
                        } catch (error) {
                            console.error('Error in on-demand thumbnail IIFE for', itemData.filePath, error);
                            const imgToUpdateOnError = document.getElementById(uniqueImgId);
                            if (imgToUpdateOnError) {
                                const parent = imgToUpdateOnError.parentElement;
                                if (parent) {
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
                img.onerror = function() { /* existing onerror logic */ };
                item.appendChild(img);

                const filenamePara = document.createElement('p');
                filenamePara.textContent = displayFileName;
                item.appendChild(filenamePara);

                // Click listener for standard media items is now handled by event delegation on mediaGrid

                const favButton = document.createElement('button');
                favButton.classList.add('favorite-btn');
                favButton.innerHTML = itemData.isFavorite ? '★' : '☆'; 
                favButton.setAttribute('aria-label', itemData.isFavorite ? 'Unmark as favorite' : 'Mark as favorite');
                favButton.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const filePath = itemData.filePath;
                    console.log(`[FAV_CLICK_RENDERER] Clicked favorite for: ${filePath}. Current itemData.isFavorite: ${itemData.isFavorite}`);
                    try {
                        const newIsFavorite = await window.electronAPI.invoke('toggle-favorite', filePath);
                        console.log(`[FAV_CLICK_RENDERER] Received newIsFavorite: ${newIsFavorite} for ${filePath}.`);
                        favButton.innerHTML = newIsFavorite ? '★' : '☆';
                        favButton.setAttribute('aria-label', newIsFavorite ? 'Unmark as favorite' : 'Mark as favorite');

                        const masterListItem = currentAllMediaItems.find(m => m.filePath === filePath);
                        if (masterListItem) {
                            console.log(`[FAV_CLICK_RENDERER] Updating masterListItem.isFavorite from ${masterListItem.isFavorite} to ${newIsFavorite} for ${filePath}`);
                            masterListItem.isFavorite = newIsFavorite;
                        } else {
                            console.warn(`[FAV_CLICK_RENDERER] masterListItem not found for ${filePath}`);
                        }
                        console.log(`[FAV_CLICK_RENDERER] Updating itemData.isFavorite from ${itemData.isFavorite} to ${newIsFavorite} for ${filePath}`);
                        itemData.isFavorite = newIsFavorite;

                        if (showingOnlyFavorites && !newIsFavorite) {
                            console.log(`[FAV_CLICK_RENDERER] In favorites view and item un-favorited. Calling renderMediaGrid() for ${filePath}`);
                            renderMediaGrid();
                        }
                    } catch (error) {
                        console.error('Error toggling favorite:', error);
                    }
                });
                item.appendChild(favButton);
            }
            mediaGrid.appendChild(item);
        } catch (error) { 
            console.error(`%c[DEBUG_POPULATE_ERROR] Error processing item [${index}]:`, 'color: red; font-weight: bold;', file, error);
        }
    });
}

// REMOVING THIS DUPLICATE/OLD selectDirBtn listener. The more complete one will be in DOMContentLoaded.

// Function to decide what to render based on the current filter
async function renderMediaGrid() { // Made async to handle potential await for history
    let currentViewName = showingOnlyFavorites ? "Favorites" : showingOnlyHistory ? "History" : showingOnlyMemos ? "Memos" : "All Media";
    console.log(`[RENDER_MEDIA_GRID] Called. Current view: ${currentViewName}. Total items in currentAllMediaItems: ${currentAllMediaItems.length}.`);
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (searchTerm) {
        console.log(`[RENDER_MEDIA_GRID] Applying search term: "${searchTerm}"`);
    }

    let itemsToDisplay = currentAllMediaItems; // Default to all items
    let messagePrefix = "Loaded";

    if (showingOnlyHistory) {
        if (memoSortControls) memoSortControls.style.display = 'none'; // Hide memo sort
        if (window.electronAPI) {
            try {
                console.log('Requesting history items...');
                itemsToDisplay = await window.electronAPI.invoke('get-history-items');
                messagePrefix = "Displaying";
            } catch (error) {
                console.error('Error fetching history items:', error);
                if (statusMessage) statusMessage.textContent = 'Error loading history.';
                itemsToDisplay = []; // Show empty on error
            }
        } else {
            itemsToDisplay = []; // Should not happen if API is available
        }
    } else if (showingOnlyFavorites) {
        if (memoSortControls) memoSortControls.style.display = 'none'; // Hide memo sort
        itemsToDisplay = currentAllMediaItems.filter(file => file.isFavorite);
        messagePrefix = "Displaying";
    } else if (showingOnlyMemos) {
        if (memoSortControls) memoSortControls.style.display = 'block'; // Or 'flex'
        messagePrefix = "Displaying"; 
        try {
            console.log('[MEMO LIST RENDER] Fetching memos list...');
            let memos = await window.electronAPI.invoke('get-memos-list');
            console.log(`[MEMO LIST RENDER] Received ${memos.length} memos.`);

            if (currentMemoSort === 'mtime_asc') {
                memos.sort((a, b) => new Date(a.lastModifiedDate) - new Date(b.lastModifiedDate));
            } else { // Default 'mtime_desc'
                memos.sort((a, b) => new Date(b.lastModifiedDate) - new Date(a.lastModifiedDate));
            }
            
            itemsToDisplay = memos;
            // Status message will be handled by populateMediaGrid or updated below if search is active
        } catch (e) {
            console.error('[MEMO LIST RENDER] Error fetching or sorting memos:', e);
            if (statusMessage) statusMessage.textContent = 'Error loading memos.';
            itemsToDisplay = [];
        }
    } else { // Default: Show all media
        if (memoSortControls) memoSortControls.style.display = 'none'; // Hide memo sort
        itemsToDisplay = currentAllMediaItems; // Ensure it's the full list for "Show All"
        messagePrefix = "Loaded";
    }

    if (searchTerm) { 
        itemsToDisplay = itemsToDisplay.filter(item => {
            if (!item) return false;
            let searchableText = '';
            if (showingOnlyMemos) {
                // For memos, search in mediaFileBaseName (if available) or memoFileName
                searchableText = (item.mediaFileBaseName || item.memoFileName || '').toLowerCase();
            } else if (item.filePath) { 
                searchableText = item.filePath.split(/\/|\\/).pop().toLowerCase();
            }
            return searchableText.includes(searchTerm);
        });
        
        if (itemsToDisplay.length === 0) {
            let baseViewName = "results"; // Generic term if no specific view is active (should not happen with current logic)
            if (showingOnlyFavorites) baseViewName = "favorites";
            else if (showingOnlyHistory) baseViewName = "history";
            else if (showingOnlyMemos) baseViewName = "memos";
            else baseViewName = "media library"; // When "Show All" is active
            if (statusMessage) statusMessage.textContent = `No items in ${baseViewName} matching "${searchTerm}".`;
        }
    }
    
    console.log(`[RENDER_MEDIA_GRID] Number of items to display after filtering/search: ${itemsToDisplay.length}. Calling populateMediaGrid.`);
    populateMediaGrid(itemsToDisplay, messagePrefix, showingOnlyMemos);
}

// REMOVING TOP-LEVEL EVENT LISTENERS FOR toggleFavoritesViewBtn and toggleHistoryViewBtn - THEY WILL BE MOVED INTO DOMContentLoaded

// Listener for newly scanned files
window.electronAPI.on('media-files-loaded', (files) => {
    console.log(`[RENDERER_EVENT] 'media-files-loaded' received with ${files.length} files.`);
    if (files.length > 0) {
        console.log(`[RENDERER_EVENT] Sample favorite status for first item: ${files[0].filePath} - isFavorite: ${files[0].isFavorite}`);
    }
    currentAllMediaItems = files; // Store the full list
    renderMediaGrid(); // Render based on current filter
});

// Listener for currently stored media list on page load
window.electronAPI.on('current-media-list-loaded', (files) => {
    console.log(`[RENDERER_EVENT] 'current-media-list-loaded' received with ${files.length} files.`);
    if (files.length > 0) {
        console.log(`[RENDERER_EVENT] Sample favorite status for first item: ${files[0].filePath} - isFavorite: ${files[0].isFavorite}`);
    }
    currentAllMediaItems = files;
    renderMediaGrid(); // Grid is populated by this call

    // Attempt to restore scroll position AFTER the grid has been rendered
    // Using a small timeout to ensure the DOM has updated and scrollHeight is correct.
    setTimeout(() => {
        console.log('%c[DEBUG_SCROLL] setTimeout for restoreScrollPosition TRIGGERED. Calling restoreScrollPosition now.', 'color: orange; font-weight: bold;');
        restoreScrollPosition();
    }, 1500);
});

function restoreScrollPosition() {
    console.log('%c[DEBUG_SCROLL] restoreScrollPosition function CALLED.', 'color: purple; font-weight: bold;');
    if (mediaGrid) { // Ensure mediaGrid is available
        const savedScrollPosString = sessionStorage.getItem('mediaGridScrollPos');
        if (savedScrollPosString !== null) {
            const savedScrollPos = parseInt(savedScrollPosString, 10);
            console.log(`[SCROLL_RESTORE] Attempting to restore scroll.`);
            console.log(`[SCROLL_RESTORE]   Saved position from sessionStorage: ${savedScrollPos}`);
            console.log(`[SCROLL_RESTORE]   mediaGrid.scrollTop (before): ${mediaGrid.scrollTop}`);
            console.log(`[SCROLL_RESTORE]   mediaGrid.scrollTop (before): ${mediaGrid.scrollTop}`);
            console.log(`[SCROLL_RESTORE]   mediaGrid.scrollHeight: ${mediaGrid.scrollHeight}`);
            console.log(`[SCROLL_RESTORE]   mediaGrid.clientHeight: ${mediaGrid.clientHeight}`);


            if (isNaN(savedScrollPos)) {
                console.error(`[SCROLL_RESTORE] Saved scroll position is NaN. Aborting restore.`);
                sessionStorage.removeItem('mediaGridScrollPos');
                return;
            }

            const docScrollHeight = document.body.scrollHeight;
            const winInnerHeight = window.innerHeight;
            console.log(`[SCROLL_RESTORE]   document.body.scrollHeight: ${docScrollHeight}`);
            console.log(`[SCROLL_RESTORE]   window.innerHeight: ${winInnerHeight}`);

            if (docScrollHeight > winInnerHeight) { // Check if the document is actually scrollable
                if (savedScrollPos > (docScrollHeight - winInnerHeight)) {
                    console.warn(`[SCROLL_RESTORE] Saved scroll position (${savedScrollPos}) is beyond the current maximum scrollable position (${docScrollHeight - winInnerHeight}). Clamping to max.`);
                    // Optionally, you could clamp savedScrollPos here:
                    // savedScrollPos = docScrollHeight - winInnerHeight;
                }

                console.log(`[SCROLL_RESTORE] Attempting to scroll window to: 0, ${savedScrollPos}`);
                window.scrollTo(0, savedScrollPos);

                setTimeout(() => {
                    const newScrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                    console.log(`[SCROLL_RESTORE]   window.pageYOffset (after attempt): ${newScrollY}`);
                    if (newScrollY === savedScrollPos) {
                        console.log(`[SCROLL_RESTORE]   Successfully restored window scroll position.`);
                    } else {
                        console.warn(`[SCROLL_RESTORE]   Window scroll position after attempt (${newScrollY}) does not match saved position (${savedScrollPos}).`);
                    }
                }, 0);
            } else {
                console.warn(`[SCROLL_RESTORE] Document is not scrollable (scrollHeight <= window.innerHeight). Scroll to ${savedScrollPos} aborted.`);
                // If not scrollable, but savedScrollPos is 0, it's effectively "restored".
                if (savedScrollPos === 0) {
                     console.log(`[SCROLL_RESTORE]   Successfully "restored" to scroll position 0 as document is not scrollable and saved position is 0.`);
                }
            }
            sessionStorage.removeItem('mediaGridScrollPos');
            console.log(`[SCROLL_RESTORE] Removed 'mediaGridScrollPos' from session storage.`);
        } else {
            // console.log("[SCROLL_RESTORE] No saved scroll position found in session storage."); // Optional: for verbosity
        }
    } else {
        console.warn("[SCROLL_RESTORE] mediaGrid element not found.");
    }
}

// Listener for generated thumbnails (from on-demand requests)
window.electronAPI.on('thumbnail-generated', (result) => {
    // result will be an object like:
    // { originalImgId: task.imgIdForRenderer, filePath: task.filePath, generatedThumbnailPath, error, details }
    if (!result || !result.originalImgId) {
        console.error('Received invalid thumbnail-generated event:', result);
        return;
    }

    const imgToUpdate = document.getElementById(result.originalImgId);
    if (imgToUpdate) {
        imgToUpdate.classList.remove('thumbnail-loading');
        // Remove any existing message overlay before adding a new one or setting src
        const existingMsg = imgToUpdate.parentElement?.querySelector('.thumbnail-message-overlay');
        if (existingMsg) existingMsg.remove();

        if (result.error === 'video_corrupt_or_unreadable') {
            imgToUpdate.classList.add('thumbnail-error');
            imgToUpdate.alt = 'Video corrupt or unreadable';
            if (imgToUpdate.parentElement) {
                const errorMsgElement = document.createElement('div');
                errorMsgElement.className = 'thumbnail-message-overlay';
                errorMsgElement.textContent = 'Video Corrupt';
                imgToUpdate.parentElement.appendChild(errorMsgElement);
            }
        } else if (result.error || !result.generatedThumbnailPath) {
            imgToUpdate.classList.add('thumbnail-error');
            const displayFileName = result.filePath ? result.filePath.split(/\/|\\/).pop() : 'File';
            imgToUpdate.alt = result.error ? `${displayFileName} - Error: ${result.error}` : `${displayFileName} - Thumbnail error: ${result.details || 'Generation failed'}`;
            console.error(`Thumbnail generation failed for ${result.filePath}:`, result.error, result.details);
            // Optionally add a generic error message overlay
            if (imgToUpdate.parentElement) {
                const errorMsgElement = document.createElement('div');
                errorMsgElement.className = 'thumbnail-message-overlay';
                errorMsgElement.textContent = 'Thumb Error'; // Generic error, alt text has details
                imgToUpdate.parentElement.appendChild(errorMsgElement);
            }
        } else { // Success
            const displayFileName = result.filePath ? result.filePath.split(/\/|\\/).pop() : 'Unnamed File';
            imgToUpdate.src = `file://${result.generatedThumbnailPath}`;
            imgToUpdate.alt = displayFileName;
        }
    } else {
        // console.warn(`Image element not found for ID: ${result.originalImgId} (possibly scrolled out of view or removed)`);
    }
});

// On DOMContentLoaded, request the current media list
document.addEventListener('DOMContentLoaded', () => {
    // Assign DOM elements
    selectDirBtn = document.getElementById('select-dir-btn');
    mediaGrid = document.getElementById('media-grid');
    statusMessage = document.getElementById('status-message');
    masterVolumeSlider = document.getElementById('master-volume');
    toggleFavoritesViewBtn = document.getElementById('toggle-favorites-view');
    toggleHistoryViewBtn = document.getElementById('toggle-history-view');
    manageFoldersBtn = document.getElementById('manage-folders-btn');
    manageFoldersModal = document.getElementById('manage-folders-modal');
    // modalCloseBtn depends on manageFoldersModal, so assign it after
    if (manageFoldersModal) {
        modalCloseBtn = manageFoldersModal.querySelector('.modal-close-btn');
    }
    registeredFoldersList = document.getElementById('registered-folders-list');
    modalStatusMessage = document.getElementById('modal-status-message');
    backgroundColorPicker = document.getElementById('background-color-picker');
    appTitleHeader = document.getElementById('app-title-header');
    searchInput = document.getElementById('search-input');
    toggleMemoListViewBtn = document.getElementById('toggle-memo-list-view-btn');
    memoSortControls = document.getElementById('memo-sort-controls');
    memoSortSelect = document.getElementById('memo-sort-select');
    refreshLibraryBtn = document.getElementById('refresh-library-btn');

    // Initialize Volume (depends on masterVolumeSlider)
    initializeVolume();

    if (mediaGrid) {
        mediaGrid.addEventListener('click', (event) => {
            // Log 1: What was the direct target of the click?
            console.log('%c[DEBUG_DELEGATE_CLICK] Click event. Event Target:', 'color: #FF7F50; font-weight: bold;', event.target);

            const clickedItemElement = event.target.closest('.media-item');

            // Log 2: Did we find a '.media-item' by traversing up from the event.target?
            console.log('%c[DEBUG_DELEGATE_CLICK] event.target.closest(".media-item") result:', 'color: #FF7F50; font-weight: bold;', clickedItemElement);

            if (clickedItemElement && !clickedItemElement.classList.contains('memo-list-item')) {
                // Log 3: Confirmed it's a valid media item
                console.log('%c[DEBUG_DELEGATE_CLICK] Valid .media-item identified.', 'color: green; font-weight: bold;', clickedItemElement);

                const filePath = clickedItemElement.getAttribute('data-filepath');
                const fileType = clickedItemElement.getAttribute('data-filetype');

                // Log 4: Values of attributes
                console.log(`%c[DEBUG_DELEGATE_CLICK] filePath: ${filePath}, fileType: ${fileType}`, 'color: green; font-weight: bold;');

                if (filePath && fileType) {
                    // Save scroll position
                    const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                    sessionStorage.setItem('mediaGridScrollPos', scrollY.toString());
                    // Log 5: The crucial save log
                    console.log(`%c[SCROLL_SAVE_DELEGATION] Saved window scroll position: ${scrollY}`, 'color: blue; font-weight: bold;');

                    // Open media
                    console.log(`Requesting to open media (delegated): ${fileType} - ${filePath}`);
                    window.electronAPI.send('open-media', { filePath: filePath, fileType: fileType });
                } else {
                    console.error('[ERROR_DELEGATION] Clicked media item is missing data-filepath or data-filetype.', clickedItemElement);
                }
            } else {
                // Log 6: If no valid media item was found from the click
                if (!clickedItemElement) {
                    console.log('%c[DEBUG_DELEGATE_CLICK] Click did not originate from a .media-item or its descendant.', 'color: orange;');
                } else if (clickedItemElement.classList.contains('memo-list-item')) {
                    console.log('%c[DEBUG_DELEGATE_CLICK] Click was on a .memo-list-item, ignored for scroll saving.', 'color: orange;');
                }
            }
        });
    } else {
        console.error("Could not find mediaGrid element to attach delegated click listener.");
    }

    // Initialize Background Color (depends on backgroundColorPicker)
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

    // Get App Name from query params and set header (depends on appTitleHeader)
    const params = new URLSearchParams(window.location.search);
    const appName = params.get('appName') || "My Media Browser"; // Fallback
    const openView = new URLSearchParams(window.location.search).get('view');

    // Deactivate all view buttons and hide memo sort controls initially
    // This ensures a clean state before applying the 'openView' parameter.
    if (toggleFavoritesViewBtn) toggleFavoritesViewBtn.classList.remove('sidebar-btn-active');
    if (toggleHistoryViewBtn) toggleHistoryViewBtn.classList.remove('sidebar-btn-active');
    if (toggleMemoListViewBtn) toggleMemoListViewBtn.classList.remove('sidebar-btn-active');
    if (memoSortControls) memoSortControls.style.display = 'none';

    // Reset all view flags. These will be updated by the openView logic if applicable.
    showingOnlyFavorites = false;
    showingOnlyHistory = false;
    showingOnlyMemos = false;

    if (openView === 'memos') {
        showingOnlyMemos = true;
        if (toggleMemoListViewBtn) toggleMemoListViewBtn.classList.add('sidebar-btn-active');
        if (memoSortControls) memoSortControls.style.display = 'block'; // Or 'flex'
    } else if (openView === 'favorites') {
        showingOnlyFavorites = true;
        if (toggleFavoritesViewBtn) toggleFavoritesViewBtn.classList.add('sidebar-btn-active');
    } else if (openView === 'history') {
        showingOnlyHistory = true;
        if (toggleHistoryViewBtn) toggleHistoryViewBtn.classList.add('sidebar-btn-active');
    }
    // If openView is 'all' or null/undefined, all flags remain false, and no buttons are active.

    if (appTitleHeader) {
        appTitleHeader.textContent = appName;
        appTitleHeader.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    // Event Listeners previously at top-level
    if (masterVolumeSlider) {
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

    if (selectDirBtn) {
        selectDirBtn.addEventListener('click', async () => {
            // Ensure mediaGrid and statusMessage are available
            if (!mediaGrid || !statusMessage) {
                console.error("Media grid or status message element not found for selectDirBtn listener.");
                return;
            }
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
                }
            } catch (error) {
                console.error('Error selecting directory:', error);
                statusMessage.textContent = `Error: ${error.message}`;
            }
        });
    } else {
        console.warn("Select directory button not found.");
    }

    if (toggleFavoritesViewBtn) {
        toggleFavoritesViewBtn.addEventListener('click', () => {
            showingOnlyFavorites = !showingOnlyFavorites;
            if (showingOnlyFavorites) {
                showingOnlyHistory = false;
                // if (toggleHistoryViewBtn) toggleHistoryViewBtn.textContent = 'Show History'; // Line removed
            }
            // toggleFavoritesViewBtn.textContent = showingOnlyFavorites ? 'Show All Media' : 'Show Favorites'; // Line removed
            renderMediaGrid();
        });
    } else {
        console.warn("Toggle favorites button not found.");
    }

    if (toggleHistoryViewBtn) {
        toggleHistoryViewBtn.addEventListener('click', async () => {
            showingOnlyHistory = !showingOnlyHistory;
            if (showingOnlyHistory) {
                showingOnlyFavorites = false;
                // if (toggleFavoritesViewBtn) toggleFavoritesViewBtn.textContent = 'Show Favorites'; // Line removed
            }
            // toggleHistoryViewBtn.textContent = showingOnlyHistory ? 'Show All Media' : 'Show History'; // Line removed
            await renderMediaGrid();
        });
    } else {
        console.warn("Toggle history button not found.");
    }

    // Search input event listener
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderMediaGrid(); // Re-render the grid, which will apply the new search term
        });
    } else {
        console.warn("Search input field not found.");
    }

    // Event Listener for toggleMemoListViewBtn
    if (toggleMemoListViewBtn) {
        toggleMemoListViewBtn.addEventListener('click', () => {
            showingOnlyMemos = !showingOnlyMemos;
            if (showingOnlyMemos) {
                showingOnlyFavorites = false; // Deactivate other views
                showingOnlyHistory = false;
                // if(toggleFavoritesViewBtn) toggleFavoritesViewBtn.textContent = 'Show Favorites'; // Line removed
                // if(toggleHistoryViewBtn) toggleHistoryViewBtn.textContent = 'Show History'; // Line removed
                // toggleMemoListViewBtn.textContent = 'Show All Media'; // Line removed
                if (memoSortControls) memoSortControls.style.display = 'block'; // Or 'flex'
            } else {
                // toggleMemoListViewBtn.textContent = 'Show Memos'; // Line removed
                if (memoSortControls) memoSortControls.style.display = 'none';
            }
            renderMediaGrid();
        });
    } else {
        console.warn("Toggle Memo List View button not found.");
    }

    // Event Listener for memoSortSelect
    if (memoSortSelect) {
        memoSortSelect.addEventListener('change', (event) => {
            currentMemoSort = event.target.value;
            if (showingOnlyMemos) { // Only re-render if memo view is active
                renderMediaGrid(); 
            }
        });
    } else {
        console.warn("Memo sort select element not found.");
    }

    // Modal event listeners (already here, but ensure elements are assigned first)
    if (manageFoldersBtn) {
        manageFoldersBtn.addEventListener('click', async () => {
            if (window.electronAPI) {
                try {
                    // Ensure modalStatusMessage and manageFoldersModal are available
                    if (!modalStatusMessage || !manageFoldersModal) {
                         console.error("Modal status message or manage folders modal not found for manageFoldersBtn listener.");
                         return;
                    }
                    modalStatusMessage.textContent = '';
                    const folders = await window.electronAPI.invoke('get-scanned-folders');
                    displayRegisteredFolders(folders); // Depends on registeredFoldersList
                    manageFoldersModal.style.display = 'block';
                } catch (error) {
                    console.error('Error fetching scanned folders:', error);
                    if (modalStatusMessage) modalStatusMessage.textContent = 'Error loading folder list.';
                    displayRegisteredFolders([]);
                    if (manageFoldersModal) manageFoldersModal.style.display = 'block';
                }
            }
        });
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            if (manageFoldersModal) manageFoldersModal.style.display = 'none';
        });
    }

    window.addEventListener('click', (event) => {
        if (event.target == manageFoldersModal) {
            if (manageFoldersModal) manageFoldersModal.style.display = 'none';
        }
    });

    if (window.electronAPI) {
        console.log('Requesting current media list from main process...');
        window.electronAPI.send('get-current-media-list');
    }

    if (refreshLibraryBtn) {
        refreshLibraryBtn.addEventListener('click', () => {
            // Ensure electronAPI and its 'send' method are available
            if (window.electronAPI && typeof window.electronAPI.send === 'function') {
                console.log('[Refresh Button] Clicked. Sending "request-library-refresh" to main process.');

                // Update status message to provide user feedback
                if (statusMessage) { // statusMessage is an existing element for displaying status
                    statusMessage.textContent = 'Refreshing library... please wait.';
                } else {
                    console.warn('statusMessage element not found, cannot display refreshing status.');
                }

                window.electronAPI.send('request-library-refresh');
            } else {
                console.error('[Refresh Button] window.electronAPI.send is not available. Cannot send refresh request.');
                if (statusMessage) {
                    statusMessage.textContent = 'Error: Refresh feature is currently unavailable.';
                }
            }
        });
    } else {
        console.warn("Refresh Library button (#refresh-library-btn) not found in the DOM. Listener not attached.");
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
