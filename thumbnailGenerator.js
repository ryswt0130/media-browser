const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

// Ensure the thumbnails directory exists
const THUMBNAILS_DIR = path.join(__dirname, 'thumbnails');
if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
}

// General Thumbnail Constants
const THUMBNAIL_WIDTH = 200;
const THUMBNAIL_HEIGHT = 150;

// Constants for HTML Title Thumbnails
const HTML_THUMB_FONT_SIZE = 16;
const HTML_THUMB_LINE_HEIGHT_EM = 1.2;
const HTML_THUMB_ACTUAL_LINE_HEIGHT = Math.floor(HTML_THUMB_FONT_SIZE * HTML_THUMB_LINE_HEIGHT_EM);
const HTML_THUMB_TEXT_COLOR = '#ffffff';
const HTML_THUMB_BACKGROUND_COLOR = '#4a5568'; // A neutral dark gray/blue
const HTML_THUMB_FONT_FAMILY = 'Arial, Helvetica, sans-serif';
const HTML_THUMB_PADDING_X = 10;
const HTML_THUMB_PADDING_Y = 10; // Top padding for first line
const HTML_THUMB_MAX_TEXT_WIDTH = THUMBNAIL_WIDTH - 2 * HTML_THUMB_PADDING_X;

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function wrapTextToTSpans(text, maxWidth, fontSize, fontFamily) {
    // Simplified approach: Estimate characters per line
    const AVG_CHAR_WIDTH_FACTOR = 0.55; // Adjusted factor, more conservative for average char width
    const CHARS_PER_LINE = Math.floor(maxWidth / (fontSize * AVG_CHAR_WIDTH_FACTOR));
    if (CHARS_PER_LINE <= 0) return [text]; // Cannot wrap meaningfully

    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
        if (currentLine.length === 0) {
            currentLine = word;
        } else if ((currentLine + ' ' + word).length <= CHARS_PER_LINE) {
            currentLine += ' ' + word;
        } else {
            // Word itself is too long for a line, break it if it's the only word
            if (currentLine.length === 0 && word.length > CHARS_PER_LINE) {
                 lines.push(word.substring(0, CHARS_PER_LINE));
                 currentLine = word.substring(CHARS_PER_LINE); // Remainder for next line
                 while(currentLine.length > CHARS_PER_LINE) {
                     lines.push(currentLine.substring(0, CHARS_PER_LINE));
                     currentLine = currentLine.substring(CHARS_PER_LINE);
                 }
            } else {
                lines.push(currentLine);
                currentLine = word;
                // Handle case where the new word itself is too long
                while(currentLine.length > CHARS_PER_LINE) {
                     lines.push(currentLine.substring(0, CHARS_PER_LINE));
                     currentLine = currentLine.substring(CHARS_PER_LINE);
                 }
            }
        }
    }
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }
    return lines.map(line => line.trim());
}


async function generateThumbnail(filePath, fileType) {
    const fileName = path.basename(filePath);
    const thumbnailFileName = `${path.parse(fileName).name}.png`; // Always save as png for consistency
    const outputPath = path.join(THUMBNAILS_DIR, thumbnailFileName);

    // Check if thumbnail already exists
    if (fs.existsSync(outputPath)) {
        // console.log(`Thumbnail already exists for ${filePath} at ${outputPath}`);
        return { generatedThumbnailPath: outputPath, error: null, details: null }; // Return object
    }

    try {
        if (fileType === 'image') {
            return new Promise((resolve) => { // Always resolve
                sharp(filePath)
                    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 1 },
                        withoutEnlargement: true
                    })
                    .toFile(outputPath, (err_sharp) => {
                        if (err_sharp) {
                            console.error(`Error generating image thumbnail for ${filePath} with sharp: ${err_sharp.message}`);
                            if (fs.existsSync(outputPath)) {
                                try { fs.unlinkSync(outputPath); } catch (e) { console.error(`Failed to delete incomplete thumbnail ${outputPath}`, e); }
                            }
                            resolve({ generatedThumbnailPath: null, error: 'image_processing_error', details: err_sharp.message });
                        } else {
                            resolve({ generatedThumbnailPath: outputPath, error: null, details: null });
                        }
                    });
            });
        } else if (fileType === 'video') {
            return new Promise((resolve) => { // Always resolve
                ffmpeg.ffprobe(filePath, (err_probe, metadata) => {
                    let seekInputOption = '1';

                    if (err_probe) {
                        console.error(`Error probing video ${filePath}: ${err_probe.message}. Falling back to default seek time.`);
                    } else if (metadata && metadata.format && metadata.format.duration) {
                        const duration = parseFloat(metadata.format.duration);
                        if (!isNaN(duration) && duration > 0) {
                            seekInputOption = (duration / 2).toString();
                            console.log(`Video duration for ${filePath}: ${duration}s, taking thumbnail at ${seekInputOption}s.`);
                        } else {
                            console.warn(`Invalid duration for ${filePath}: ${metadata.format.duration}. Falling back to default seek time.`);
                        }
                    } else {
                        console.warn(`Could not get duration for ${filePath}. Falling back to default seek time.`);
                    }

                    const filterString = `scale=w=${THUMBNAIL_WIDTH}:h=${THUMBNAIL_HEIGHT}:force_original_aspect_ratio=decrease,pad=w=${THUMBNAIL_WIDTH}:h=${THUMBNAIL_HEIGHT}:x=(ow-iw)/2:y=(oh-ih)/2:color=black`;

                    ffmpeg(filePath)
                        .setStartTime(seekInputOption) // Seek to the chosen timestamp
                        .frames(1) // Extract a single frame
                        .videoFilter(filterString) // Apply scaling and padding
                        // .size(`${THUMBNAIL_WIDTH}x${THUMBNAIL_HEIGHT}`) // Output canvas size, should be handled by pad
                        .output(outputPath) // Specify full output path (was thumbnailFileName before, now full outputPath)
                        .on('end', () => {
                            console.log(`Generated video thumbnail for ${filePath} at ${seekInputOption}s, saved to ${outputPath}`);
                            resolve({ generatedThumbnailPath: outputPath, error: null, details: null });
                        })
                        .on('error', (err_ffmpeg) => {
                            let errorType = 'ffmpeg_error_unknown';
                            if (err_ffmpeg.message && /Invalid data|moov atom not found|Segment not found|Error while decoding/i.test(err_ffmpeg.message)) {
                                errorType = 'video_corrupt_or_unreadable';
                            }
                            console.error(`Error generating video thumbnail for ${filePath} (${errorType}): ${err_ffmpeg.message}`);
                            if (fs.existsSync(outputPath)) {
                                try { fs.unlinkSync(outputPath); } catch (e) { console.error(`Failed to delete incomplete thumbnail ${outputPath}`, e); }
                            }
                            resolve({ generatedThumbnailPath: null, error: errorType, details: err_ffmpeg.message });
                        })
                        .run();
                });
            });
        } else if (fileType === 'html') {
            return new Promise(async (resolve) => {
                try {
                    // The first, simpler title processing block is removed.
                    // Start directly with the more refined title processing:
                    let title = path.basename(filePath, path.extname(filePath))
                                  .replace(/-/g, ' ').replace(/_/g, ' ');
                    // Basic camelCase/PascalCase to space-separated words, then capitalize
                    title = title.replace(/([A-Z]+)/g, " $1").replace(/([A-Z][a-z])/g, " $1").replace(/^ /, '');
                    title = title.split(' ').map(word => word.charAt(0).toUpperCase() + word.substring(1)).join(' ');

                    const lines = wrapTextToTSpans(title, HTML_THUMB_MAX_TEXT_WIDTH, HTML_THUMB_FONT_SIZE, HTML_THUMB_FONT_FAMILY);
                    const MAX_VISIBLE_LINES = Math.floor((THUMBNAIL_HEIGHT - 2 * HTML_THUMB_PADDING_Y) / HTML_THUMB_ACTUAL_LINE_HEIGHT);

                    let tspanElements = '';
                    for (let i = 0; i < Math.min(lines.length, MAX_VISIBLE_LINES); i++) {
                        let lineText = lines[i];
                        if (i === MAX_VISIBLE_LINES - 1 && lines.length > MAX_VISIBLE_LINES) {
                            // Estimate chars per line for ellipsis
                            const CHARS_PER_LINE = Math.floor(HTML_THUMB_MAX_TEXT_WIDTH / (HTML_THUMB_FONT_SIZE * 0.55));
                            if (lineText.length > CHARS_PER_LINE - 3) { // Check if ellipsis is needed based on CHARS_PER_LINE
                                lineText = lineText.substring(0, Math.max(0, CHARS_PER_LINE - 3)).trimEnd() + '...';
                            } else if (lines.length > MAX_VISIBLE_LINES) { // If it fits but there are more lines
                                lineText = lineText.trimEnd() + '...';
                            }
                        }
                        // For the first tspan, dy is 0 relative to text element's y. For others, it's line height.
                        const dy = (i === 0) ? 0 : HTML_THUMB_ACTUAL_LINE_HEIGHT;
                        tspanElements += `<tspan x="${HTML_THUMB_PADDING_X}" dy="${dy}">${escapeHTML(lineText)}</tspan>`;
                    }

                    const svgContent = `
                      <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
                        <rect width="100%" height="100%" fill="${HTML_THUMB_BACKGROUND_COLOR}" />
                        <text x="${HTML_THUMB_PADDING_X}" y="${HTML_THUMB_PADDING_Y + HTML_THUMB_FONT_SIZE * 0.8}"
                              font-family="${HTML_THUMB_FONT_FAMILY}" font-size="${HTML_THUMB_FONT_SIZE}" fill="${HTML_THUMB_TEXT_COLOR}">
                          ${tspanElements}
                        </text>
                      </svg>
                    `;
                    const svgBuffer = Buffer.from(svgContent);
                    await sharp(svgBuffer).png().toFile(outputPath);
                    console.log(`Generated HTML title thumbnail for ${filePath}`);
                    resolve({ generatedThumbnailPath: outputPath, error: null, details: null });

                } catch (genError) {
                    console.error(`Error generating HTML thumbnail for ${filePath}:`, genError);
                    resolve({ generatedThumbnailPath: null, error: 'html_thumb_generation_error', details: genError.message });
                }
            });
        } else {
            console.warn(`Unsupported file type for thumbnail generation: ${fileType} for file ${filePath}`);
            return Promise.resolve({ generatedThumbnailPath: null, error: 'unsupported_file_type', details: `File type ${fileType} is not supported for thumbnail generation.` });
        }
    } catch (error) { // Catch synchronous errors from initial setup (e.g., path parsing)
        console.error(`Failed to generate thumbnail (outer catch) for ${filePath}: ${error.message}`);
        // This outputPath might not be correctly defined if error is very early
        // but try to clean up if it was.
        try {
            if (outputPath && fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        } catch(e) {/*ignore cleanup error*/}
        // Return a Promise that resolves to the error object structure
        return Promise.resolve({ generatedThumbnailPath: null, error: 'setup_error', details: error.message });
    }
}

function generateExpectedThumbnailFilename(originalFilePath) {
    // Generates the base filename for the thumbnail, e.g., "myvideo.png"
    // Consistent with how generateThumbnail names files.
    return `${path.parse(path.basename(originalFilePath)).name}.png`;
}

module.exports = { generateThumbnail, THUMBNAILS_DIR, generateExpectedThumbnailFilename };
