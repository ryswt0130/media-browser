const fs = require('fs');
const path = require('path');

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const HTML_EXTENSIONS = ['.html', '.htm'];

function scanDirectory(directoryPath, recursive = true) { // Added recursive parameter
    const mediaFiles = [];

    if (!fs.existsSync(directoryPath) || !fs.lstatSync(directoryPath).isDirectory()) {
        console.error(`Error: Directory not found or is not a directory: ${directoryPath}`);
        return [];
    }

    try {
        // Use withFileTypes to easily distinguish files from directories without extra lstat calls
        const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

        for (const entry of entries) {
            const filePath = path.join(directoryPath, entry.name);

            if (entry.isDirectory()) {
                if (recursive) { // Only recurse if the flag is true
                    mediaFiles.push(...scanDirectory(filePath, true)); // Or scanDirectory(filePath, recursive)
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                let fileType = null;

                if (VIDEO_EXTENSIONS.includes(ext)) {
                    fileType = 'video';
                } else if (IMAGE_EXTENSIONS.includes(ext)) {
                    fileType = 'image';
                } else if (HTML_EXTENSIONS.includes(ext)) {
                    fileType = 'html';
                }

                if (fileType) {
                    mediaFiles.push({ filePath, fileType });
                }
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${directoryPath}: ${error.message}`);
        // Optionally, re-throw the error or handle it as needed
    }

    return mediaFiles;
}

module.exports = { scanDirectory };
