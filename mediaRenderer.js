function escapeHTML(text) {
    if (typeof text !== 'string') {
        return text;
    }
    return text.replace(/[&<>"']/g, function(match) {
        switch (match) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return match;
        }
    });
}

function formatMemoForDisplay(memoContent) {
    try {
        if (typeof memoContent !== 'string' || memoContent.trim() === "") {
            return escapeHTML(memoContent); 
        }

        const lines = memoContent.split('\n');
        const htmlLines = lines.map(line => {
            // Regex for [HH:MM:SS] possibly followed by other text on the same line part
            const timestampWithRestRegex = /^\[(\d{2}:\d{2}:\d{2})\](.*)/; 
            const matchWithRest = line.match(timestampWithRestRegex);

            if (matchWithRest) {
                const time = matchWithRest[1]; // HH:MM:SS
                const rest = matchWithRest[2]; // Stuff after [HH:MM:SS] on the same line part
                
                // If rest is empty, it means the line part was effectively just [HH:MM:SS]
                if (rest.trim() === "") { 
                     return `<span class="clickable-timestamp" data-time="${time}">${time}</span>`;
                } else { // Line part was [HH:MM:SS] followed by other text
                     return `<span class="clickable-timestamp" data-time="${time}">${time}</span>` + escapeHTML(rest);
                }
            }
            // No timestamp pattern at the start of this line part, so escape the whole line part
            return escapeHTML(line); 
        });
        return htmlLines.join('\n');
    } catch (error) {
        console.error("Error in formatMemoForDisplay:", error);
        // Return the original content, escaped, as a fallback to prevent breaking UI.
        // Or return a specific error message string if preferred.
        return escapeHTML(memoContent) || ""; // Ensure it's at least an empty string if memoContent was null/undefined
    }
}

const DEFAULT_BACKGROUND_COLOR = '#222'; // Default for media page, might differ from index.html
const BACKGROUND_COLOR_STORAGE_KEY = 'appBackgroundColor';

function applyMediaPageBackgroundColor(color) { // Renamed to avoid conflict if ever merged
    document.body.style.backgroundColor = color;
}

document.addEventListener('DOMContentLoaded', () => {
    const mediaViewerContainer = document.getElementById('media-viewer-container');
    const backToGridBtn = document.getElementById('back-to-grid-btn');
    const mediaFavoriteBtn = document.getElementById('media-favorite-btn');
    const recommendationsGrid = document.getElementById('recommendations-grid');
    const appTitleHeader = document.getElementById('app-title-header');
    const mediaPageContainer = document.querySelector('.media-page-container'); // Get main container

    let currentFilePath = null;
    let currentFileType = null;
    let currentIsFavorite = false;
    let currentAppName = "My Media Browser";
    let currentVideoElement = null;
    let currentFilePathOnPage = null;
    let currentRawMemoContent = ''; // Added for new memo workflow
    const mediaTitleDisplay = document.getElementById('media-title-display');
    const memoSection = document.getElementById('memo-section'); 
    const memoTextArea = document.getElementById('memo-textarea');
    const saveMemoBtn = document.getElementById('save-memo-btn');
    const insertTimestampBtn = document.getElementById('insert-timestamp-btn');
    const memoStatusMessage = document.getElementById('memo-status-message');
    const memoDisplayArea = document.getElementById('memo-display-area');
    // editMemoBtn and cancelEditMemoBtn are no longer used with the new UI flow
    // const editMemoBtn = document.getElementById('edit-memo-btn');
    // const cancelEditMemoBtn = document.getElementById('cancel-edit-memo-btn');

    // Old mode switching functions are no longer needed
    // function showMemoDisplayMode(content) { ... }
    // function showMemoEditMode(currentContent) { ... }

    // Apply initial background color
    const savedColor = localStorage.getItem(BACKGROUND_COLOR_STORAGE_KEY);
    applyMediaPageBackgroundColor(savedColor || DEFAULT_BACKGROUND_COLOR);


    function updateFavoriteButtonVisual() {
        if (mediaFavoriteBtn) {
            mediaFavoriteBtn.innerHTML = currentIsFavorite ? '★' : '☆';
            mediaFavoriteBtn.setAttribute('aria-label', currentIsFavorite ? 'Unmark as favorite' : 'Mark as favorite');
        }
    }

    if (mediaFavoriteBtn) {
        mediaFavoriteBtn.addEventListener('click', async () => {
            if (!currentFilePath) return;
            try {
                console.log(`Toggling favorite for media page: ${currentFilePath}`);
                currentIsFavorite = await window.electronAPI.invoke('toggle-favorite', currentFilePath);
                updateFavoriteButtonVisual();
                console.log(`New favorite status for ${currentFilePath}: ${currentIsFavorite}`);
            } catch (error) {
                console.error('Error toggling favorite on media page:', error);
            }
        });
    }

    function clearMediaViewer() {
        const mediaElements = mediaViewerContainer.querySelectorAll('video, img, iframe, p#media-error-message'); // Include error message if it has an ID
        mediaElements.forEach(el => el.remove());
        currentVideoElement = null; 
    }

    function clearRecommendations() {
        recommendationsGrid.innerHTML = '';
    }

    function applyVolumeToVideo(videoElement, volume) {
        if (videoElement) {
            videoElement.volume = volume;
            console.log(`Applied volume ${volume} to video.`);
        }
    }

    function loadMedia(filePath, fileType, isFavorite, appName, isInitialPageLoad = false) {
        // Update global vars that hold the current state based on parameters
        currentFilePath = filePath; // This is the target file to load
        currentFileType = fileType;
        currentIsFavorite = isFavorite === true || isFavorite === 'true';
        currentAppName = appName || "My Media Browser";

        updateFavoriteButtonVisual();
        clearMediaViewer();
        clearRecommendations();

        // Clear title robustly at the start of loading new media
        if (mediaTitleDisplay) {
            mediaTitleDisplay.textContent = '';
        } else {
            // This case should ideally not happen if script order and DOM are correct.
            console.error("#media-title-display element not found at start of loadMedia.");
        }

        // Apply/Remove maximized class for HTML view
        if (mediaPageContainer) {
            if (fileType === 'html') {
                mediaPageContainer.classList.add('html-view-maximized');
            } else {
                mediaPageContainer.classList.remove('html-view-maximized');
            }
        }

        const newUrl = `media.html?filePath=${encodeURIComponent(filePath)}&fileType=${encodeURIComponent(fileType)}&isFavorite=${currentIsFavorite}&appName=${encodeURIComponent(currentAppName)}`;
        const stateObject = { filePath, fileType, isFavorite: currentIsFavorite, appName: currentAppName };

        if (isInitialPageLoad || filePath === currentFilePathOnPage) {
            // If it's the first load of this specific page instance, or we are "reloading" the same media item
            // (e.g. due to popstate or an external favorite update), replace the state.
            history.replaceState(stateObject, '', newUrl);
        } else {
            // If loading a new distinct media item (e.g. from recommendations), push a new state.
            history.pushState(stateObject, '', newUrl);
        }
        currentFilePathOnPage = filePath; // Update what's actually displayed

        if (!filePath || !fileType) {
            const errorMessage = document.createElement('p');
            errorMessage.textContent = 'Media file path or type not provided.';
            // Insert error message before the title display
            if (mediaTitleDisplay) {
                mediaViewerContainer.insertBefore(errorMessage, mediaTitleDisplay);
            } else {
                mediaViewerContainer.appendChild(errorMessage); // Fallback if title not found
            }
            console.error('Media file path or type not provided for loadMedia.');
            // Hide memo section if no media is loaded
            if (memoSection) memoSection.style.display = 'none';
            if (insertTimestampBtn) insertTimestampBtn.style.display = 'none';
            return;
        }
        // Show memo section when media is loaded
        if (memoSection) memoSection.style.display = 'block';


        console.log(`Displaying media: ${fileType} - ${filePath}`);
        const safeFilePath = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

        if (fileType === 'video') {
            const video = document.createElement('video');
            video.src = safeFilePath;
            video.controls = true;
            video.autoplay = true;
            // Insert video before the title display
            if (mediaTitleDisplay) {
                mediaViewerContainer.insertBefore(video, mediaTitleDisplay);
            } else {
                mediaViewerContainer.appendChild(video); // Fallback if title not found
            }
            currentVideoElement = video; // Store reference

            // Apply stored/default master volume
            const savedVolume = localStorage.getItem('masterVolume');
            let initialVolume = 0.5;
            if (savedVolume !== null) {
                initialVolume = parseFloat(savedVolume);
            }
            applyVolumeToVideo(currentVideoElement, initialVolume);

        } else if (fileType === 'image') {
            const img = document.createElement('img');
            img.src = safeFilePath;
            img.alt = `Image: ${filePath}`;
            // Insert image before the title display
            if (mediaTitleDisplay) {
                mediaViewerContainer.insertBefore(img, mediaTitleDisplay);
            } else {
                mediaViewerContainer.appendChild(img); // Fallback if title not found
            }
        } else if (fileType === 'html') {
            const iframe = document.createElement('iframe');
            iframe.src = safeFilePath;
            // Insert iframe before the title display
            if (mediaTitleDisplay) {
                mediaViewerContainer.insertBefore(iframe, mediaTitleDisplay);
            } else {
                mediaViewerContainer.appendChild(iframe); // Fallback if title not found
            }
        } else {
            const errorMessage = document.createElement('p');
            errorMessage.textContent = `Unsupported file type: ${fileType}`;
            // Insert error message before the title display
            if (mediaTitleDisplay) {
                mediaViewerContainer.insertBefore(errorMessage, mediaTitleDisplay);
            } else {
                mediaViewerContainer.appendChild(errorMessage); // Fallback if title not found
            }
        }

        // After loading media, get recommendations and add to history
        if (window.electronAPI) {
            console.log(`Requesting recommendations for: ${filePath}`);
            window.electronAPI.send('get-recommendations', { filePath, fileType });

            console.log(`Adding to history: ${filePath} (${fileType})`);
            window.electronAPI.send('add-to-history', { filePath, fileType });
        }

        // Load Memo
        if (memoDisplayArea && memoTextArea) { 
            memoTextArea.value = ''; // Clear input field for new entries
            memoDisplayArea.innerText = ''; // Clear display area initially
            window.electronAPI.invoke('get-memo', currentFilePath)
                .then(fetchedMemoContent => {
                    currentRawMemoContent = fetchedMemoContent; // Store the original content
                    
                    // Use the new formatting function
                    memoDisplayArea.innerHTML = formatMemoForDisplay(fetchedMemoContent); 
                    
                    console.log(`[MEMO] Memo loaded and displayed for: ${currentFilePath}`);
                })
                .catch(e => {
                    console.error(`[MEMO] Error loading memo in loadMedia for ${currentFilePath}:`, e);
                    currentRawMemoContent = "Error loading memo."; 
                    memoDisplayArea.innerText = currentRawMemoContent; 
                });
        }

        // Timestamp button visibility (based on current media type)
        if (insertTimestampBtn) {
            insertTimestampBtn.style.display = (currentFileType === 'video' ? 'inline-block' : 'none');
        }

        // Set the new media title
        if (mediaTitleDisplay) {
            const displayFileName = filePath && typeof filePath === 'string' ? (filePath.split(/\/|\\/).pop() || 'Unnamed Media') : 'Invalid File Path';
            console.log(`Setting media title to: "${displayFileName}" for filePath: "${filePath}"`);
            mediaTitleDisplay.textContent = displayFileName;
            if (!displayFileName || displayFileName === 'Invalid File Path') {
                console.warn(`displayFileName for title was problematic. filePath: "${filePath}"`);
            }
        } else {
            console.error("#media-title-display element not found when trying to set title.");
        }
    }

    function displayRecommendations(recommendedFiles) {
        clearRecommendations();
        if (!recommendedFiles || recommendedFiles.length === 0) {
            const noRecsMessage = document.createElement('p');
            noRecsMessage.textContent = 'No recommendations found.';
            recommendationsGrid.appendChild(noRecsMessage);
            return;
        }

        recommendedFiles.forEach(file => {
            const item = document.createElement('div');
            item.classList.add('recommended-item'); // Use new class for styling

            const img = document.createElement('img');
            if (file.thumbnailPath) {
                let thumbnailUrl = file.thumbnailPath.startsWith('file://') ? file.thumbnailPath : `file://${file.thumbnailPath}`;
                img.src = thumbnailUrl;
            } else {
                img.alt = `${file.fileType} (no thumbnail)`;
            }
            img.onerror = () => { img.alt = 'Failed to load'; };

            const filename = document.createElement('p');
            filename.textContent = file.filePath.split(/\/|\\/).pop();

            item.appendChild(img);
            item.appendChild(filename);

            item.addEventListener('click', () => {
                console.log(`Clicked recommended item: ${file.filePath}`);
                // When loading from recommendation, it's a new history entry (isInitialPageLoad = false)
                // Pass currentAppName, and the file's own isFavorite status
                loadMedia(file.filePath, file.fileType, file.isFavorite, currentAppName, false);
            });
            recommendationsGrid.appendChild(item);
        });
    }

    // Handle browser back/forward navigation
    window.onpopstate = (event) => {
        console.log("onpopstate triggered", event.state);
        if (event.state && event.state.filePath) {
            // Load media using the state from history, treat as initial load for state replacement
            loadMedia(
                event.state.filePath,
                event.state.fileType,
                event.state.isFavorite,
                event.state.appName,
                true // True because we are navigating TO an existing entry, URL is already changed by browser
            );
        } else {
            // If event.state is null, it might be the initial page load or a state not set by us.
            // Try to re-parse from URL.
            const params = new URLSearchParams(window.location.search);
            const filePathFromUrl = params.get('filePath');
            const fileTypeFromUrl = params.get('fileType');
            const isFavoriteFromUrl = params.get('isFavorite') === 'true';
            const appNameFromUrl = params.get('appName') || "My Media Browser";
            if (filePathFromUrl && fileTypeFromUrl) {
                loadMedia(filePathFromUrl, fileTypeFromUrl, isFavoriteFromUrl, appNameFromUrl, true);
            } else {
                console.warn("Popstate event with no state and unable to parse valid media from URL.");
                // Optionally, redirect to index or show error
            }
        }
    };

    // Initial Load
    const params = new URLSearchParams(window.location.search);
    const initialFilePath = params.get('filePath');
    const initialFileType = params.get('fileType');
    const initialIsFavorite = params.get('isFavorite') === 'true';
    const initialAppName = params.get('appName') || "My Media Browser";

    if (appTitleHeader) {
        appTitleHeader.textContent = initialAppName; // Use initialAppName here
        appTitleHeader.addEventListener('click', () => {
            window.location.href = 'index.html'; // Navigate home
        });
    }

    const loadingMessage = document.getElementById('media-loading-message');
    if (loadingMessage) loadingMessage.remove();

    if (initialFilePath && initialFileType) {
        loadMedia(initialFilePath, initialFileType, initialIsFavorite, initialAppName, true);
    } else {
        clearMediaViewer();
        if (mediaFavoriteBtn) mediaFavoriteBtn.style.display = 'none';
        if (mediaTitleDisplay) mediaTitleDisplay.textContent = ' - No Media Loaded - '; // Placeholder for title
        const errorMessage = document.createElement('p');
        errorMessage.textContent = 'Media file path or type not provided in URL.';
        mediaViewerContainer.appendChild(errorMessage);
        console.error('Initial media file path or type not provided.');
    }

    // IPC listener for recommendations
    if (window.electronAPI) {
        window.electronAPI.on('recommendations-loaded', (recommendedFiles) => {
            console.log('Received recommendations:', recommendedFiles);
            displayRecommendations(recommendedFiles);
        });

        // IPC listener for real-time master volume changes
        window.electronAPI.on('apply-master-volume', (newVolume) => {
            console.log(`Received apply-master-volume event with volume: ${newVolume}`);
            if (currentVideoElement && currentFileType === 'video') {
                applyVolumeToVideo(currentVideoElement, newVolume);
            }
        });

        // Listener for background color changes from other windows
        window.electronAPI.on('apply-background-color', (newColor) => {
            console.log(`Applying background color from IPC: ${newColor}`);
            applyMediaPageBackgroundColor(newColor);
        });
    }

    // Back button
    backToGridBtn.addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // Memo Save Button Event Listener
    if (saveMemoBtn && memoTextArea) {
        saveMemoBtn.addEventListener('click', async () => {
            if (!currentFilePath) {
                alert('No media file loaded to associate memo with.');
                return;
            }
            try {
                let newEntry = memoTextArea.value.trim(); // User's input

                // Check if the entry is truly empty
                if (newEntry === "") {
                    if (memoStatusMessage) {
                        memoStatusMessage.textContent = 'Memo entry is empty.';
                        memoStatusMessage.className = 'error'; 
                        memoStatusMessage.classList.add('show');
                        setTimeout(() => {
                            if (memoStatusMessage) memoStatusMessage.classList.remove('show');
                        }, 3000);
                    }
                    return; 
                }
                // Timestamp-only entries are now allowed, so no further specific checks for that.
                // The prefix logic has already been removed in a previous step.

                const contentToSave = (currentRawMemoContent ? currentRawMemoContent + "\n\n" : "") + newEntry;

                console.log(`[MEMO] Saving memo for: ${currentFilePath}`);
                const result = await window.electronAPI.invoke('save-memo', { 
                    mediaFilePath: currentFilePath, 
                    content: contentToSave
                });
                if (result.success) {
                    console.log(`[MEMO] Memo entry saved for: ${currentFilePath}`);
                    if (memoStatusMessage) {
                        memoStatusMessage.textContent = 'Entry saved!'; // Updated message
                        memoStatusMessage.className = 'success'; 
                        memoStatusMessage.classList.add('show'); 

                        setTimeout(() => {
                            if (memoStatusMessage) { 
                                memoStatusMessage.classList.remove('show'); 
                            }
                        }, 3000); 
                    }
                    // After saving, clear the textarea and reload the full memo display
                    memoTextArea.value = ''; 
                    
                    // Fetch the latest full memo content after save
                    const updatedMemoContent = await window.electronAPI.invoke('get-memo', currentFilePath);
                    
                    // Store the raw updated content
                    currentRawMemoContent = updatedMemoContent; 
                    
                    // Format for display and then set innerText
                    if(memoDisplayArea) {
                        memoDisplayArea.innerHTML = formatMemoForDisplay(updatedMemoContent);
                    }
                } else {
                    throw new Error(result.error || 'Unknown error saving memo.');
                }
            } catch (e) {
                console.error(`[MEMO] Error saving memo: `, e);
                if (memoStatusMessage) {
                    memoStatusMessage.textContent = `Error: ${e.message || 'Failed to save'}`;
                    memoStatusMessage.className = 'error'; // Set color class
                    memoStatusMessage.classList.add('show'); // Trigger fade-in and visibility

                    setTimeout(() => {
                        if (memoStatusMessage) {
                            memoStatusMessage.classList.remove('show'); // Trigger fade-out
                        }
                    }, 5000); 
                }
            }
        });
    }

    // Event listeners for editMemoBtn and cancelEditMemoBtn are removed as buttons are removed.

    // Insert Timestamp Button Event Listener
    if (insertTimestampBtn && memoTextArea) {
        insertTimestampBtn.addEventListener('click', () => {
            if (currentVideoElement && currentFileType === 'video') {
                const time = currentVideoElement.currentTime;
                const hours = Math.floor(time / 3600);
                const minutes = Math.floor((time % 3600) / 60);
                const seconds = Math.floor(time % 60);
                const timestamp = `[${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]\n`;
                
                const start = memoTextArea.selectionStart;
                const end = memoTextArea.selectionEnd;
                const text = memoTextArea.value;
                memoTextArea.value = text.substring(0, start) + timestamp + text.substring(end);
                memoTextArea.focus();
                memoTextArea.selectionStart = memoTextArea.selectionEnd = start + timestamp.length;
                console.log(`[MEMO] Timestamp inserted: ${timestamp.trim()}`);
            } else {
                console.warn('[MEMO] Insert timestamp clicked but no video element or not a video.');
            }
        });
    }

    // (Inside DOMContentLoaded, after memoDisplayArea is defined)
    if (memoDisplayArea) {
        memoDisplayArea.addEventListener('click', (event) => {
            const target = event.target;
            if (target.classList.contains('clickable-timestamp')) {
                event.preventDefault(); // Good practice, though span won't have default behavior

                const timeString = target.dataset.time; // HH:MM:SS
                if (!timeString) {
                    console.error('Timestamp data attribute not found on clicked element:', target);
                    return;
                }

                const parts = timeString.split(':');
                if (parts.length !== 3) {
                    console.error('Invalid timestamp format:', timeString);
                    return;
                }

                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                const seconds = parseInt(parts[2], 10);

                if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
                    console.error('Invalid time components in timestamp:', timeString);
                    return;
                }

                const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

                if (currentVideoElement && currentFileType === 'video') {
                    currentVideoElement.currentTime = totalSeconds;
                    // Optionally, ensure the video plays if it's paused.
                    // if (currentVideoElement.paused) {
                    //     currentVideoElement.play();
                    // }
                    console.log(`Timestamp clicked: ${timeString}, seeking video to ${totalSeconds}s.`);
                } else {
                    console.log(`Timestamp clicked: ${timeString}, but no video element or not a video file.`);
                    // Optionally, inform the user via a status message if it's not obvious
                    // why clicking did nothing (e.g., if viewing an image).
                }
            }
        });
    } else {
        console.warn("memoDisplayArea not found, cannot attach click listener for timestamps.");
    }
});
