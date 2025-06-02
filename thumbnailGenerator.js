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
const HTML_THUMB_FONT_SIZE = 14;
const HTML_THUMB_LINE_HEIGHT_EM = 1.2;
const HTML_THUMB_ACTUAL_LINE_HEIGHT = Math.floor(HTML_THUMB_FONT_SIZE * HTML_THUMB_LINE_HEIGHT_EM);
const HTML_THUMB_TEXT_COLOR = '#ffffff';
const HTML_THUMB_BACKGROUND_COLOR = '#4a5568'; // A neutral dark gray/blue
const HTML_THUMB_FONT_FAMILY = "'Meiryo', 'Yu Gothic', 'Hiragino Kaku Gothic ProN', 'MS PGothic', Arial, sans-serif"; // Kept for context, though not directly used by new wrapTextToTSpans
const HTML_THUMB_PADDING_X = 10;
const HTML_THUMB_PADDING_Y = 10; // Top padding for first line
const HTML_THUMB_MAX_TEXT_WIDTH = THUMBNAIL_WIDTH - 2 * HTML_THUMB_PADDING_X; // Kept for context

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function wrapTextToTSpans(text, maxWidth, fontSize, fontFamily) { // Signature kept for compatibility
    const TARGET_LINE_WIDTH = 13.0; // Target width in full-width character equivalents

    function getCharDisplayWidth(char) {
        const code = char.charCodeAt(0);

        // ASCII (0.5)
        if (code >= 0x0000 && code <= 0x007F) return 0.5;
        // Half-width Katakana (0.5)
        if (code >= 0xFF61 && code <= 0xFF9F) return 0.5;

        // CJK Symbols and Punctuation (1.0)
        if (code >= 0x3000 && code <= 0x303F) return 1.0;
        // Hiragana (1.0)
        if (code >= 0x3040 && code <= 0x309F) return 1.0;
        // Katakana (1.0)
        if (code >= 0x30A0 && code <= 0x30FF) return 1.0;
        // CJK Unified Ideographs (Chinese, Japanese, Korean) (1.0)
        if (code >= 0x4E00 && code <= 0x9FFF) return 1.0;
        // Full-width forms (e.g., full-width English letters, numbers, symbols) (1.0)
        if (code >= 0xFF00 && code <= 0xFFEF) return 1.0;

        // Broader heuristic for other characters:
        if (code > 255) return 1.0; // Default others (often accented Latin, etc.) to full-width

        return 0.5; // Default for remaining characters (e.g., some punctuation not in CJK symbols)
    }

    const lines = [];
    let currentLine = "";
    let currentLineWidth = 0;
    const words = text.split(' ');

    function calculateWordWidth(word) {
        let width = 0;
        for (const char of word) {
            width += getCharDisplayWidth(char);
        }
        return width;
    }

    for (const word of words) {
        const wordWidth = calculateWordWidth(word);
        const spaceWidth = 0.5; // Assuming space is half-width

        if (currentLine === "") { // Current line is empty
            if (wordWidth > TARGET_LINE_WIDTH) {
                // Word itself is too long, needs character-by-character breaking
                let tempWordPart = "";
                let tempWordPartWidth = 0;
                for (const char of word) {
                    const charWidth = getCharDisplayWidth(char);
                    if (tempWordPart !== "" && tempWordPartWidth + charWidth > TARGET_LINE_WIDTH) {
                        lines.push(tempWordPart);
                        tempWordPart = char;
                        tempWordPartWidth = charWidth;
                    } else {
                        tempWordPart += char;
                        tempWordPartWidth += charWidth;
                    }
                }
                // After iterating through chars of a long word, the remainder is the new current line
                currentLine = tempWordPart;
                currentLineWidth = tempWordPartWidth;
            } else { // Word fits on a new empty line
                currentLine = word;
                currentLineWidth = wordWidth;
            }
        } else { // Current line has content
            if (currentLineWidth + spaceWidth + wordWidth > TARGET_LINE_WIDTH) {
                // Word doesn't fit on the current line with a space
                lines.push(currentLine); // Push the existing line
                // Now handle the new word for the next line
                if (wordWidth > TARGET_LINE_WIDTH) {
                     // Word itself is too long for a new line, needs character-by-character breaking
                    let tempWordPart = "";
                    let tempWordPartWidth = 0;
                    for (const char of word) {
                        const charWidth = getCharDisplayWidth(char);
                        if (tempWordPart !== "" && tempWordPartWidth + charWidth > TARGET_LINE_WIDTH) {
                            lines.push(tempWordPart);
                            tempWordPart = char;
                            tempWordPartWidth = charWidth;
                        } else {
                            tempWordPart += char;
                            tempWordPartWidth += charWidth;
                        }
                    }
                    currentLine = tempWordPart; // Remainder of the word
                    currentLineWidth = tempWordPartWidth;
                } else { // Word fits entirely on a new line
                    currentLine = word;
                    currentLineWidth = wordWidth;
                }
            } else { // Word fits on the current line with a space
                currentLine += " " + word;
                currentLineWidth += spaceWidth + wordWidth;
            }
        }
    }

    if (currentLine !== "") { // Push any remaining line content
        lines.push(currentLine);
    }

    return lines;
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
                    // MAX_VISIBLE_LINES calculation now depends on how many lines the new wrapTextToTSpans returns
                    // and the available vertical space after the 3-line gap for the title.
                    // The y position of text is HTML_THUMB_PADDING_Y + HTML_THUMB_FONT_SIZE * 0.8 + (3 * HTML_THUMB_ACTUAL_LINE_HEIGHT)
                    // Available height for text lines: THUMBNAIL_HEIGHT - (y_position_of_first_line_baseline - HTML_THUMB_FONT_SIZE * 0.8) - HTML_THUMB_PADDING_Y (for bottom)
                    // This simplifies to: THUMBNAIL_HEIGHT - (HTML_THUMB_PADDING_Y + 3 * HTML_THUMB_ACTUAL_LINE_HEIGHT) - HTML_THUMB_PADDING_Y
                    const textBlockStartY = HTML_THUMB_PADDING_Y + (3 * HTML_THUMB_ACTUAL_LINE_HEIGHT);
                    const availableHeightForText = THUMBNAIL_HEIGHT - textBlockStartY - HTML_THUMB_PADDING_Y;
                    const MAX_VISIBLE_LINES = Math.max(0, Math.floor(availableHeightForText / HTML_THUMB_ACTUAL_LINE_HEIGHT));


                    let tspanElements = '';
                    for (let i = 0; i < Math.min(lines.length, MAX_VISIBLE_LINES); i++) {
                        let lineText = lines[i];
                        // Ellipsis logic might need refinement if a single line from wrapTextToTSpans is still too long
                        // for the visual container, though wrapTextToTSpans aims to prevent this.
                        // For now, assume lines from wrapTextToTSpans are short enough.
                        if (i === MAX_VISIBLE_LINES - 1 && lines.length > MAX_VISIBLE_LINES) {
                           // Add ellipsis to the last visible line if there are more lines than can be shown
                           if (lineText.length > 3) { // Ensure there's space for ellipsis
                               lineText = lineText.substring(0, lineText.length - 2) + '...';
                           } else {
                               lineText = '...'; // Or just ellipsis if line is too short
                           }
                        }
                        // For the first tspan, dy is 0 relative to text element's y. For others, it's line height.
                        const dy = (i === 0) ? 0 : HTML_THUMB_ACTUAL_LINE_HEIGHT;
                        tspanElements += `<tspan x="${HTML_THUMB_PADDING_X}" dy="${dy}">${escapeHTML(lineText)}</tspan>`;
                    }

                    const svgContent = `
                      <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
                        <rect width="100%" height="100%" fill="${HTML_THUMB_BACKGROUND_COLOR}" />
                        <text x="${HTML_THUMB_PADDING_X}" y="${HTML_THUMB_PADDING_Y + HTML_THUMB_FONT_SIZE * 0.8 + (3 * HTML_THUMB_ACTUAL_LINE_HEIGHT)}"
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
