# Timestamp Converter Chrome Extension

A Chrome extension that automatically detects timestamps in highlighted text, converts them to UTC, and maintains a list of converted timestamps accessible across all browser tabs.

## Features

- **Automatic Detection**: Highlights text containing various timestamp formats (Unix timestamps, ISO 8601, common date formats)
- **UTC Conversion**: Automatically converts detected timestamps to UTC format
- **Persistent Storage**: Maintains a list of converted timestamps that persists across browser sessions
- **Cross-Tab Access**: View your timestamp list from any browser tab
- **Visual Feedback**: Shows confirmation when timestamps are detected and converted
- **Easy Management**: Copy timestamps to clipboard, remove individual entries, or clear all at once

## Supported Timestamp Formats

The extension recognizes the following timestamp formats:

- **Unix Timestamps**: 
  - 10-digit seconds (e.g., `1640995200`)
  - 13-digit milliseconds (e.g., `1640995200000`)
- **ISO 8601**: `2022-01-01T00:00:00Z`
- **Common Date Formats**:
  - `2022-01-01 12:00:00`
  - `01/01/2022 12:00:00`
  - `01-01-2022 12:00:00`
- **Time Formats with Timezone**:
  - `4:00:00 PM EDT`, `4:00 PM EDT`
  - `16:00:00 EDT`, `16:00 EDT`
- **Date + Time with Timezone**:
  - `2022-01-01 4:00:00 PM EDT`
  - `01/01/2022 4:00 PM EST`
- **Supported Timezones**: EST, EDT, CST, CDT, MST, MDT, PST, PDT, UTC, GMT

## Installation

### Method 1: Load as Unpacked Extension (Development)

1. Download or clone this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top right corner
4. Click "Load unpacked" button
5. Select the folder containing the extension files
6. The extension should now appear in your extensions list

### Method 2: Add Icons (Optional)

The extension works without icons, but you can add them for a better look:
1. Open `generate-icons.html` in your web browser
2. Click the download buttons to generate `icon16.png`, `icon48.png`, and `icon128.png`
3. Place the downloaded icons in the extension folder
4. Add this section to your `manifest.json` file:
```json
  "icons": {
    "16": "icon16.png",
    "48": "icon48.png",
    "128": "icon128.png"
  },
```

## Usage

1. **Highlight Text**: On any webpage, highlight text that contains timestamps
2. **Automatic Detection**: If timestamps are found, you'll see a green confirmation notification
3. **View Conversions**: Click the extension icon in the Chrome toolbar to open the popup window
4. **Manage Timestamps**: 
   - View all converted timestamps with their original values
   - Copy UTC timestamps to clipboard
   - Remove individual entries
   - Clear all timestamps
   - See source page information for each timestamp

## Example Usage

Try highlighting these example timestamps on any webpage:

- Unix timestamp: `1640995200`
- Unix milliseconds: `1640995200000`
- ISO format: `2022-01-01T00:00:00Z`
- Standard format: `2022-01-01 12:00:00`
- Time with timezone: `4:00:00 PM EDT`
- Date + time with timezone: `01/01/2022 4:00 PM EST`

## File Structure

```
timestamp-converter/
├── manifest.json          # Extension configuration
├── content.js            # Content script for timestamp detection
├── background.js         # Background script for data management
├── popup.html           # Popup window HTML
├── popup.js             # Popup window JavaScript
├── popup.css            # Popup window styling
├── icon.svg             # SVG icon source
├── generate-icons.html  # Icon generator tool
└── README.md            # This file
```

## Technical Details

- **Manifest Version**: 3 (latest Chrome extension format)
- **Permissions**: 
  - `storage`: For persisting timestamp data
  - `activeTab`: For accessing page content
- **Storage**: Uses Chrome's local storage API (limited to last 100 timestamps)
- **Cross-Tab**: Background script maintains data across all tabs

## Privacy

- This extension only processes text that you explicitly highlight
- All data is stored locally in your browser
- No data is transmitted to external servers
- Timestamp list includes source page URLs for reference

## Troubleshooting

### Extension Not Working
- Ensure Developer mode is enabled in Chrome extensions
- Check browser console for any error messages
- Try reloading the extension

### Timestamps Not Detected
- Make sure you're highlighting the exact timestamp text
- Check if the timestamp format is supported
- Some very unusual formats may not be recognized

### Popup Not Opening
- Try right-clicking the extension icon and selecting "Inspect popup"
- Check for JavaScript errors in the popup console

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the extension.

## License

This project is open source and available under the MIT License. 