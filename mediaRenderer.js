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
    const mediaTitleDisplay = document.getElementById('media-title-display');

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
        mediaViewerContainer.innerHTML = ''; // Clear previous media
        currentVideoElement = null; // Clear reference
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
            mediaViewerContainer.appendChild(errorMessage);
            console.error('Media file path or type not provided for loadMedia.');
            return;
        }

        console.log(`Displaying media: ${fileType} - ${filePath}`);
        const safeFilePath = filePath.startsWith('file://') ? filePath : `file://${filePath}`;

        if (fileType === 'video') {
            const video = document.createElement('video');
            video.src = safeFilePath;
            video.controls = true;
            video.autoplay = true;
            mediaViewerContainer.appendChild(video);
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
            mediaViewerContainer.appendChild(img);
        } else if (fileType === 'html') {
            const iframe = document.createElement('iframe');
            iframe.src = safeFilePath;
            mediaViewerContainer.appendChild(iframe);
        } else {
            const errorMessage = document.createElement('p');
            errorMessage.textContent = `Unsupported file type: ${fileType}`;
            mediaViewerContainer.appendChild(errorMessage);
        }

        // After loading media, get recommendations and add to history
        if (window.electronAPI) {
            console.log(`Requesting recommendations for: ${filePath}`);
            window.electronAPI.send('get-recommendations', { filePath, fileType });

            console.log(`Adding to history: ${filePath} (${fileType})`);
            window.electronAPI.send('add-to-history', { filePath, fileType });
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
});
