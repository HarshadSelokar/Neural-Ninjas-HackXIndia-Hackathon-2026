# SiteSage Chrome Extension

A Manifest V3 browser extension that injects an AI chatbot sidebar into any website, powered by your RAG backend.

## Features

✅ **Sidebar Chatbot** - Fixed-position sidebar injected into any webpage  
✅ **Site Detection** - Automatically extracts domain and caches ingestion status  
✅ **Dual Mode** - Website-grounded (RAG) or General AI mode toggle  
✅ **Backend Integration** - Seamless calls to `/ingest` and `/chat` APIs  
✅ **Chrome Storage Caching** - Skip re-ingestion on repeat visits  
✅ **Dark Mode** - Respects system color scheme  
✅ **Invalid Page Handling** - Friendly errors for chrome://, file://, etc.  

## File Structure

```
ext_frontend/
├── manifest.json          # Extension config (Manifest V3)
├── popup.html             # Popup UI
├── popup.js               # Popup logic
├── content.js             # Content script (sidebar injector)
├── background.js          # Service worker
└── README.md              # This file
```

## Installation (Chrome/Brave)

1. **Load extension in Chrome:**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select this `ext_frontend` folder

2. **Load extension in Brave:**
   - Open `brave://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select this `ext_frontend` folder

3. **Verify installation:**
   - You should see "SiteSage" extension in your extensions menu
   - Icon will appear in the toolbar

## Usage

### First Time on a Website

1. Click the SiteSage extension icon
2. Popup shows "Initialize Chatbot for This Site"
3. Click the button → extension crawls and embeds the website
4. Once complete, click "Open Sidebar"

### Sidebar Features

**Header:**
- App name and close button (×)

**Mode Toggle:**
- 🌐 **Website Mode** (default) - Answers grounded in website content
- 🤖 **General Mode** - Unrestricted AI knowledge

**Chat Area:**
- Message history with badges (Website-Grounded / General AI)
- Sources displayed below website-mode answers
- Scroll-friendly message layout

**Input:**
- Type question and press Enter or click send button
- Shows loading indicator while fetching response

### Subsequent Visits

- If you visit the same website again, the extension recognizes it
- Shows "Ready to Chat" with cached data
- Click "Open Sidebar" to resume (no re-ingestion needed)
- Click "Re-ingest" to refresh the website data

## Backend URL Configuration

By default, the extension connects to `http://127.0.0.1:8000`.

To change this, edit `popup.js` and `content.js`:

```javascript
const BACKEND_URL = "http://your-backend-url:8000";
```

## API Contract

The extension calls these endpoints:

### `/ingest` (POST)
```json
{
  "url": "https://example.com"
}
```

Response:
```json
{
  "status": "success",
  "chunks_indexed": 348,
  "pages_crawled": 12,
  "site_id": "example.com",
  "cached": false
}
```

### `/chat` (POST)
```json
{
  "question": "What is this site about?",
  "site_id": "example.com",
  "mode": "rag"
}
```

Response:
```json
{
  "answer": "This site is about...",
  "sources": [
    { "url": "https://example.com/about", "title": "About Us" }
  ],
  "mode": "rag"
}
```

## Invalid Pages

The extension detects and blocks access on:
- `chrome://` pages
- `file://` local files
- `about://` browser pages
- `edge://` browser pages
- `data://` URIs

User sees: "Cannot load chatbot on this page"

## Storage

Uses `chrome.storage.local` to cache:
- `site_{domain}` → ingestion metadata
  - `url` - Original website URL
  - `chunksIndexed` - Number of chunks
  - `pagesIndexed` - Pages crawled
  - `cached` - Whether data was from cache
  - `timestamp` - When cached

## Browser Support

✅ Chrome 88+  
✅ Brave 1.31+  
✅ Edge 88+  

## Notes

- Sidebar is fixed-position; doesn't interfere with page layout
- Content script runs on `<all_urls>` but filtered by invalid page check
- Messages between popup and content script ensure sidebar injection
- Dark mode auto-detected from system preferences

## Troubleshooting

**Sidebar doesn't appear:**
- Check browser console for errors
- Verify backend is running at configured URL
- Try re-loading the page

**Backend 404 errors:**
- Ensure backend is running on `http://127.0.0.1:8000`
- Check `BACKEND_URL` in `popup.js` and `content.js`
- Verify `/ingest` and `/chat` endpoints exist

**Storage not working:**
- Check Chrome DevTools → Application → Storage → Local Storage
- Extension stores keys like `site_example.com`

---

**Made with ❤️ for the RAG chatbot hackathon**
