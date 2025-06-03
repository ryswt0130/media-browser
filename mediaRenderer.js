// Helper function to convert hex color to RGB
function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') {
        return null; // Or a default like { r: 0, g: 0, b: 0 }
    }
    // Remove leading #
    hex = hex.startsWith('#') ? hex.slice(1) : hex;

    // Handle shorthand hex (e.g., "03F")
    if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
    }

    if (hex.length !== 6) {
        console.warn("Invalid hex color format for hexToRgb:", hex);
        return null; // Or a default
    }

    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    if (isNaN(r) || isNaN(g) || isNaN(b)) {
        console.warn("Error parsing hex to RGB components:", hex);
        return null; // Or a default
    }
    return { r, g, b };
}

// Helper function to calculate luminance
function calculateLuminance(rgb) {
    if (!rgb || typeof rgb.r !== 'number' || typeof rgb.g !== 'number' || typeof rgb.b !== 'number') {
        return 0; // Default to dark if input is invalid
    }
    // Formula: L = 0.299*R + 0.587*G + 0.114*B
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

// Assume hexToRgb, calculateLuminance are defined above.
// Assume mediaTitleDisplay is accessible (e.g., defined in DOMContentLoaded and this function is also called from there, or mediaTitleDisplay is passed as param).

function updateTitleColorBasedOnBackground() {
    // Ensure mediaTitleDisplay is available. It's typically assigned in DOMContentLoaded.
    // If mediaTitleDisplay is not globally scoped for mediaRenderer.js, this function might need
    // to be defined inside DOMContentLoaded or take mediaTitleDisplay as an argument.
    // For this subtask, we'll assume it can be accessed.
    const titleElement = document.getElementById('media-title-display'); // Or use existing mediaTitleDisplay variable
    if (!titleElement) {
        console.warn("Media title display element not found for color update.");
        return;
    }

    // Get the computed background color of the body
    const bodyBackgroundColor = window.getComputedStyle(document.body).backgroundColor;
    // getComputedStyle returns colors in rgb(R, G, B) or rgba(R, G, B, A) format.

    let rgb;
    const rgbMatch = bodyBackgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
    if (rgbMatch) {
        rgb = {
            r: parseInt(rgbMatch[1], 10),
            g: parseInt(rgbMatch[2], 10),
            b: parseInt(rgbMatch[3], 10)
        };
    } else {
        // Fallback if color is not in rgb/rgba (e.g. named color, though unlikely for computed style of body bg)
        // Or if it's 'transparent'. For transparent, we can't determine a contrasting color well.
        // Defaulting to a light title color might be best or trying to parse it as hex if it is one.
        // For now, if not parsable as RGB, try to see if it's a hex that needs conversion from localStorage
        // This path is less likely for computed style of body.
        console.warn("Could not parse body background color directly as RGB:", bodyBackgroundColor);
        // Attempt to use the stored hex color as a fallback path if direct RGB parsing fails
        const storedHexColor = localStorage.getItem('appBackgroundColor'); // BACKGROUND_COLOR_STORAGE_KEY
        if (storedHexColor) {
            rgb = hexToRgb(storedHexColor);
        } else {
            // If no stored hex and not parsable, default to assuming dark background
             titleElement.style.color = ''; // Revert to CSS default (assumed light)
             return;
        }
    }

    if (!rgb) { // If hexToRgb also failed or no stored color
        console.warn("Failed to get valid RGB for background color.");
        titleElement.style.color = ''; // Revert to CSS default
        return;
    }

    const luminance = calculateLuminance(rgb);
    const LUMINANCE_THRESHOLD = 204;

    if (luminance >= LUMINANCE_THRESHOLD) { // If background is light
        titleElement.style.color = '#000000'; // Set title to black
    } else { // If background is dark
        titleElement.style.color = ''; // Revert to CSS default (e.g., #e0e0e0)
    }
    // console.log(`Background luminance: ${luminance.toFixed(2)}, Title color set to: ${titleElement.style.color || 'default'}`);
}

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
    // escapeHTML function should be defined elsewhere and accessible.

    if (typeof memoContent !== 'string' || memoContent.trim() === "") {
        return ""; // Return empty string for empty/invalid input
    }

    try {
        const entries = memoContent.split('\n\n');
        if (entries.length === 1 && entries[0].trim() === "") {
             return "";
        }

        const allEntriesHtml = entries.map((entryText, index) => {
            if (entryText.trim() === "") {
                return "";
            }

            const lines = entryText.split('\n');
            const clickableEntryLines = lines.map(line => {
                const timestampWithRestRegex = /^\[(\d{2}:\d{2}:\d{2})\](.*)/;
                const matchWithRest = line.match(timestampWithRestRegex);
                if (matchWithRest) {
                    const time = matchWithRest[1];
                    const rest = matchWithRest[2];
                    if (rest.trim() === "") {
                         return `<span class="clickable-timestamp" data-time="${time}">${time}</span>`;
                    } else {
                         return `<span class="clickable-timestamp" data-time="${time}">${time}</span>` + escapeHTML(rest);
                    }
                }
                return escapeHTML(line);
            });
            const formattedEntryHtml = clickableEntryLines.join('\n');

            // New HTML structure with actions container and confirm/cancel buttons
            return `<div class="memo-entry" data-entry-index="${index}">` +
                       `<div class="memo-entry-content">${formattedEntryHtml}</div>` +
                       `<div class="memo-entry-actions">` +
                           `<button class="delete-memo-entry-btn" data-entry-index="${index}" aria-label="Delete this entry">X</button>` +
                           `<button class="confirm-delete-btn" data-entry-index="${index}" style="display:none;" aria-label="Confirm delete">Confirm</button>` +
                           `<button class="cancel-delete-btn" data-entry-index="${index}" style="display:none;" aria-label="Cancel delete">Cancel</button>` +
                       `</div>` +
                   `</div>`;
        });

        return allEntriesHtml.filter(html => html !== "").join('');
    } catch (error) {
        console.error("Error in formatMemoForDisplay:", error);
        return escapeHTML(memoContent) || "";
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
    applyMediaPageBackgroundColor(savedColor || DEFAULT_BACKGROUND_COLOR); // Applies initial background
    updateTitleColorBasedOnBackground(); // Add this call here


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
            updateTitleColorBasedOnBackground(); // Add this call here
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
        memoDisplayArea.addEventListener('click', async (event) => {
            const target = event.target;
            const memoEntryElement = target.closest('.memo-entry'); // Find the parent memo entry
            let entryIndex = -1;

            if (memoEntryElement) {
                entryIndex = parseInt(memoEntryElement.dataset.entryIndex, 10);
            }

            // --- Handle Clickable Timestamps ---
            if (target.classList.contains('clickable-timestamp')) {
                event.preventDefault();
                const timeString = target.dataset.time;
                // ... (rest of existing timestamp logic - parsing time, currentVideoElement.currentTime = ...)
                // This logic should be complete and correct as per previous steps.
                if (!timeString) { /* ... error ... */ return; }
                const parts = timeString.split(':');
                if (parts.length !== 3) { /* ... error ... */ return; }
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                const seconds = parseInt(parts[2], 10);
                if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) { /* ... error ... */ return; }
                const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
                if (currentVideoElement && currentFileType === 'video') {
                    currentVideoElement.currentTime = totalSeconds;
                    console.log(`Timestamp clicked: ${timeString}, seeking video to ${totalSeconds}s.`);
                } else {
                    console.log(`Timestamp clicked: ${timeString}, but no video element or not a video file.`);
                }
                return; // Handled timestamp click
            }

            // --- Handle Initial Delete Click ("X" button) ---
            if (target.classList.contains('delete-memo-entry-btn')) {
                event.preventDefault();
                if (memoEntryElement) {
                    const confirmBtn = memoEntryElement.querySelector('.confirm-delete-btn');
                    const cancelBtn = memoEntryElement.querySelector('.cancel-delete-btn');
                    target.style.display = 'none'; // Hide 'X'
                    if (confirmBtn) confirmBtn.style.display = 'inline-block';
                    if (cancelBtn) cancelBtn.style.display = 'inline-block';
                }
                return; // Handled initial delete click
            }

            // --- Handle Cancel Delete Click ---
            if (target.classList.contains('cancel-delete-btn')) {
                event.preventDefault();
                if (memoEntryElement) {
                    const deleteBtn = memoEntryElement.querySelector('.delete-memo-entry-btn');
                    const confirmBtn = memoEntryElement.querySelector('.confirm-delete-btn');
                    target.style.display = 'none'; // Hide 'Cancel'
                    if (confirmBtn) confirmBtn.style.display = 'none'; // Hide 'Confirm'
                    if (deleteBtn) deleteBtn.style.display = 'inline-block'; // Show 'X'
                }
                return; // Handled cancel delete click
            }

            // --- Handle Confirm Delete Click ---
            if (target.classList.contains('confirm-delete-btn')) {
                event.preventDefault();
                if (isNaN(entryIndex) || entryIndex < 0) {
                    console.error('Invalid or missing entry index for confirm delete.');
                    alert('Error: Could not determine which entry to delete.');
                    return;
                }

                // No confirm() dialog needed here anymore.
                try {
                    let entries = currentRawMemoContent.split('\n\n');
                    if (entryIndex >= 0 && entryIndex < entries.length) {
                        entries.splice(entryIndex, 1);
                        const newContentToSave = entries.join('\n\n');

                        const result = await window.electronAPI.invoke('save-memo', {
                            mediaFilePath: currentFilePath,
                            content: newContentToSave
                        });

                        if (result.success) {
                            const updatedMemoContentFromServer = await window.electronAPI.invoke('get-memo', currentFilePath);
                            currentRawMemoContent = updatedMemoContentFromServer;
                            memoDisplayArea.innerHTML = formatMemoForDisplay(currentRawMemoContent);
                            // No specific "Entry deleted" message needed here as the entry just disappears.
                            // Or, a more generic "Memo updated" could be shown if desired.
                            if (memoStatusMessage) {
                                memoStatusMessage.textContent = 'Entry deleted.'; // Or 'Memo updated.'
                                memoStatusMessage.className = 'success';
                                memoStatusMessage.classList.add('show');
                                setTimeout(() => {
                                    if (memoStatusMessage) memoStatusMessage.classList.remove('show');
                                }, 3000);
                            }
                        } else {
                            throw new Error(result.error || 'Unknown error saving memo after deletion.');
                        }
                    } else {
                        console.error('Invalid entry index for actual deletion:', entryIndex);
                        alert('Error: Could not delete entry, index out of bounds.');
                    }
                } catch (e) {
                    console.error('Error confirming memo entry deletion:', e);
                    alert(`Failed to delete entry: ${e.message}`);
                    if (memoStatusMessage) {
                        // ... (error message display) ...
                    }
                    // Optional: revert button visibility to initial state on error
                    if (memoEntryElement) {
                        const deleteBtn = memoEntryElement.querySelector('.delete-memo-entry-btn');
                        const confirmBtn = memoEntryElement.querySelector('.confirm-delete-btn');
                        const cancelBtn = memoEntryElement.querySelector('.cancel-delete-btn');
                        if (deleteBtn) deleteBtn.style.display = 'inline-block';
                        if (confirmBtn) confirmBtn.style.display = 'none';
                        if (cancelBtn) cancelBtn.style.display = 'none';
                    }
                }
                return; // Handled confirm delete click
            }
        });
    }
});
