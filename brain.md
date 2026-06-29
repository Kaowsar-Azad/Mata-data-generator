# MetadataPro - Project Architecture & Knowledge Base (brain.md)

## 1. Project Overview & Purpose
**MetadataPro** is a comprehensive, professional desktop application designed specifically for microstock contributors and digital artists. Its primary purpose is to automate and streamline the entire workflow of preparing assets for microstock agencies (like Shutterstock, Adobe Stock, Freepik, etc.).

Instead of manually generating metadata, upscaling, removing backgrounds, creating EPS vectors, and uploading files one by one, MetadataPro combines all these steps into a single integrated suite. 

### Core Capabilities:
- **Automated Metadata Generation**: Uses AI (Gemini) to generate optimized titles, descriptions, and keywords for stock photos/vectors.
- **Image Upscaling**: Enhances image resolution using Local GPU (Real-ESRGAN / Upscayl) or Cloud AI (Hugging Face).
- **Vector Magic**: Converts raster images into high-fidelity SVG vectors and compliant EPS 10 files.
- **Background Removal**: Uses local AI (ModNet), Hugging Face, or remove.bg to accurately remove backgrounds.
- **EPS Previews**: Automatically generates high-quality JPG/PNG previews from EPS files using Ghostscript.
- **FTP Upload System**: Directly uploads the finished assets to multiple microstock agencies simultaneously.

---

## 2. Technology Stack
The project is built using a modern desktop web-stack hybrid approach:
- **Frontend**: React 19, Vite, Lucide React (Icons).
- **Desktop Wrapper**: Electron (packages the web app into a native desktop experience).
- **Local API Backend**: Node.js + Express (handles heavy computational tasks and proxies external APIs to avoid CORS/browser limitations).
- **AI & ML Integration**: 
  - `@google/generative-ai` (Gemini for text).
  - `@imgly/background-removal-node` / `Xenova/modnet` (Local background removal).
  - `@gradio/client` (Interacting with Hugging Face Spaces for upscaling and generation).
  - `@neplex/vectorizer` & `imagetracerjs` (Raster to Vector conversion).
- **Native Tools**: 
  - `Ghostscript` (gswin64c.exe) for EPS rendering and generation.
  - `FFmpeg` for video frame extraction.
  - `Sharp` for high-performance image processing.
  - `Real-ESRGAN` (realesrgan-ncnn-vulkan) for local GPU upscaling.

---

## 3. Project Directory Structure

```text
e:\matadata\
│
├── electron/               # Electron desktop app files
│   ├── main.cjs            # Main process: Handles IPC, Native OS calls, Local GPU execution
│   └── preload.cjs         # Preload script linking Electron to React securely
│
├── server/                 # Local Node.js Express backend
│   └── index.js            # Port 3002: Handles ModNet, Vectorization, Proxying, Multer uploads
│
├── src/                    # React Frontend Source Code
│   ├── App.jsx             # Main Dashboard, Sidebar, Tab Navigation & Global State
│   ├── index.css           # Global styles and Tailwind-like utility classes
│   ├── components/         # UI Components for each feature
│   │   ├── AiImageGenerator.jsx    # Cloud Image Generation UI
│   │   ├── ApiKeyManager.jsx       # Manages API Keys (stored in local storage)
│   │   ├── BackgroundRemover.jsx   # Background Removal UI
│   │   ├── EpsPreviewGenerator.jsx # Auto EPS to JPG preview generator
│   │   ├── FtpConfigManager.jsx    # Manages FTP/SFTP connections
│   │   ├── FtpUploader.jsx         # Uploads files to agencies
│   │   ├── ImageToPrompt.jsx       # Reverse engineers images to prompts
│   │   ├── ImageUpscaler.jsx       # AI Upscaling UI
│   │   ├── MetadataGenerator/      # Metadata Generation workflow
│   │   ├── PromptSettings.jsx      # Settings for metadata rules (char limits, etc.)
│   │   └── VectorMagic.jsx         # Raster to Vector UI
│   │
│   └── services/           # Frontend API Wrappers
│       ├── geminiService.js        # Logic for interacting with Google Gemini API
│       ├── epsService.js           # Logic for handling EPS files
│       ├── removeBgProxy.js        # Background removal fetch logic
│       └── ...
│
├── bin/                    # Pre-packaged native binaries (Ghostscript, Upscayl)
├── dist/                   # Built React frontend
├── dist-electron/          # Built Electron files
└── package.json            # Dependencies and Build scripts (vite build, electron-builder)
```

---

## 4. How the Systems Work Together (The Data Flow)

Because web browsers have strict limitations (CORS, filesystem access restrictions, limited memory for heavy AI models), the app uses a **Three-Tier Architecture** running locally on the user's PC:

### A. The Frontend (React UI)
- Runs inside the Electron Chromium window.
- Gathers user inputs, API keys, and files.
- Uses `fetch` to talk to the Local Node Backend (`http://localhost:3002`) or uses `window.electronAPI` (IPC) to talk to the Electron Main Process for native tasks.

### B. The Local Express Backend (`server/index.js`)
- Runs concurrently with the UI.
- **Why it exists:** Handles things that require large memory or network proxying.
- **Tasks:**
  - `multer` handles receiving temporary file uploads from the frontend.
  - Runs `@imgly/background-removal-node` locally (loads ML models into RAM).
  - Proxies requests to Hugging Face or ComfyUI to bypass Cloudflare/CORS blocks.
  - Converts images to SVG using `@neplex/vectorizer` and generates EPS using Ghostscript `eps2write`.

### C. The Electron Main Process (`electron/main.cjs`)
- **Why it exists:** Has full access to the Windows OS, system registry, and native executable files.
- **Tasks:**
  - Finds the `gswin64c.exe` (Ghostscript) executable on the user's PC to extract PNG previews from `.eps` files.
  - Spawns child processes to run `realesrgan-ncnn-vulkan.exe` (Local GPU upscaling).
  - Uses `ffmpeg` to extract frames from video files.
  - Reads and writes final files directly to the user's hard drive.

---

## 5. Detailed Module Workflows (Step-by-Step)

### 5.1. Metadata Generation
1. User drops an image into `ImageWorkflow.jsx`.
2. Frontend converts image to base64.
3. `geminiService.js` sends the image + user rules (from `PromptSettings`) to Google's Gemini Vision API.
4. Gemini returns Title, Description, and Keywords formatted for stock agencies.
5. (Future/Optional) The app can embed this EXIF data directly into the JPG using `exiftool-vendored`.

### 5.2. Vector Magic (Raster to EPS)
1. User drops a JPG/PNG.
2. Frontend sends it to `server/index.js` (`/api/vectorize`).
3. Server uses `sharp` to apply edge-preserving smoothing (median filter).
4. Server uses `@neplex/vectorizer` (or HF cloud fallback) to trace the image into an SVG.
5. Frontend requests `/api/convert-to-eps`.
6. Server converts SVG to PDF using `pdfkit`, then spawns Ghostscript to convert PDF into a highly compatible EPS 10 file.

### 5.3. AI Image Upscaler
1. User drops a low-res image.
2. Frontend asks `electron/main.cjs` via IPC to upscale.
3. Electron decides the engine:
   - If **Cloud (Mata AI)**: Connects to HuggingFace space (`finegrain/finegrain-image-enhancer`), uploads, processes, and downloads the hi-res image.
   - If **Local GPU**: Spawns `upscayl-bin.exe` in the `bin/` folder, passes the image, and lets the local graphics card (Vulkan) upscale it using models like `realesrgan-x4plus`.
4. Output is saved to the disk.

### 5.4. Background Remover
1. Frontend sends image to `server/index.js`.
2. Depending on the user's choice:
   - **Local Mode**: Runs `Xenova/modnet` entirely on CPU/RAM via transformers.js.
   - **HF Mode**: Sends to `briaai/BRIA-RMBG-1.4` on Hugging Face.
3. The server uses `sharp` to clean up the mask boundaries (gamma correction, dest-in compositing) to prevent white halos.
4. Returns a transparent PNG.

### 5.5. FTP Uploader
1. User configures FTP/SFTP credentials in `FtpConfigManager`.
2. Passwords can be stored securely.
3. In `FtpUploader`, user selects files (JPGs, EPS, Videos).
4. App connects via `basic-ftp` or `ssh2-sftp-client` and uploads them to configured agencies (Shutterstock, Adobe, etc.) simultaneously.

---

## Summary for AI Agent (Future Reference)
When asked to modify this project:
- **UI changes:** Look in `src/components/`.
- **Heavy Data Processing/API Proxies:** Look in `server/index.js`.
- **Native OS / Executables (GS, FFmpeg, Upscayl):** Look in `electron/main.cjs`.
- **State Management:** Primarily handled in `App.jsx` and passed down as props.
- Ensure any new Node.js native dependencies are compatible with Vite/Electron packaging (use the backend `server/index.js` for safe execution of Node modules if they conflict with Vite's frontend bundler).
