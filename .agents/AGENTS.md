# Workspace Rules

## STRICT POLICY: Frozen File Guard
The file `src/services/apis/gemini.js` is strictly **FROZEN and LOCKED**.
- **Rule:** Do NOT modify, rewrite, delete, or append to the file [gemini.js](file:///E:/matadata/src/services/apis/gemini.js) under any circumstances.
- **Exception:** You may only modify the file if the user explicitly grants permission in the direct chat transcript (e.g. "I permit you to modify gemini.js" or "Unlock gemini.js").

## STRICT POLICY: Git Push Restriction
- **Rule:** Do NOT execute the command `git push` under any circumstances unless the user explicitly grants permission in the direct chat transcript (e.g. "I permit you to push code" or "Push the changes to github").
- **Action:** If changes need to be pushed to the remote repository, you MUST ask the user for permission in the chat first. Do not push speculatively.

## STRICT POLICY: Git Pull & Overall Modification Restriction
- **Rule:** Do NOT execute `git pull`, `git fetch`, or any command to bring code from git without explicit permission.
- **Rule:** Do NOT modify any other sections or files without explicit permission.
- **Action:** Always ask for permission before modifying any file or performing git operations.

## STRICT POLICY: SEO & User-Friendly Code Guidelines
The entire app must strictly adhere to the following SEO and user-friendly guidelines:
1. **Semantic HTML:** The landing page must use only ONE `<h1>` tag containing the app's main name and core keyword. Use `<h2>`, `<h3>`, etc., sequentially for feature descriptions.
2. **Core Web Vitals:** Optimize for LCP (< 2.5s), INP (< 200ms), and CLS (< 0.1). Ensure fast loading times and stable layouts.
3. **Mobile-Responsive:** The app MUST be fully responsive and optimized for all devices, prioritizing a mobile-first indexing approach.
4. **Descriptive URLs:** Keep routing URLs short and keyword-rich. Avoid random numbers in the URL.
5. **Schema Markup (JSON-LD):** Implement `SoftwareApplication` schema in the HTML. It MUST include `name`, `operatingSystem`, `applicationCategory`, `offers`, and `aggregateRating`.
6. **On-Page Optimization (Keywords):** Place target keywords (e.g., metadata remover, batch editing) in the Title tag, Meta Description, and the early content of the page.
7. **Image Alt Text:** All images (especially UI screenshots) MUST have descriptive `alt` text.
8. **Above the Fold CTA:** A clear Call-to-Action button (e.g., Download, Start) must be visible above the fold without requiring the user to scroll.
9. **ZERO UI/UX or Logic Changes:** When modifying any HTML tags to improve semantic structure or SEO, the visual design, layout, and functionality MUST remain 100% identical. Preserve all existing CSS/Tailwind classes.
10. **Dynamic Meta Tags & Open Graph:** Use dynamic meta tags (e.g., via `react-helmet-async`) to ensure titles and descriptions update properly in a client-side rendered SPA.
11. **Accessibility & ARIA:** Add descriptive `aria-label` attributes to interactive elements, icons, and buttons to improve accessibility (a key SEO ranking factor).
12. **Clean HTML5 Routing:** Ensure navigation utilizes clean, indexable paths rather than hash-based routing.

## STRICT POLICY: Architecture & Code Security
The app must be protected against reverse engineering and common vulnerabilities, STRICTLY WITHOUT altering functionality or logic:
1. **Command Injection Prevention:** When using subprocesses (like Ghostscript or FFmpeg via `spawn`), NEVER use `shell: true`. Pass arguments securely as an array, removing manual string quotes from variables.
2. **Electron Sandboxing (Process Isolation):** Enforce `sandbox: true` in `webPreferences` to ensure renderer processes are sandboxed (Least Privilege principle) without breaking existing IPC.
3. **Code Obfuscation:** Integrate `vite-plugin-javascript-obfuscator` in the Vite build process to protect the source code against reverse engineering.
4. **Credential Security:** Existing synchronous API key logic is preserved to avoid functionality changes, but any new implementations must use secure storage.

## STRICT POLICY: Protect Image to Prompt Code (Gemini Only)
- **Rule:** Do NOT modify the prompt strings (`modelFormattingRule`, `dynamicInstruction`, `variationPrompt`, and `exactMatchPrompt`) inside the `generatePromptFromImage` function in `src/services/geminiService.js`.
- **Rule:** Do NOT modify the **Gemini Route** block (where `GoogleGenerativeAI` is instantiated and `generateContentWithTimeout` is called with the image and prompt) inside the `generatePromptFromImage` function.
- **Exception:** The OpenAI, Groq, OpenRouter, and Mistral routing blocks inside `generatePromptFromImage` are EXEMPT from this rule and can be modified.
- **Action:** The AI may only modify the Gemini prompts and Gemini routing logic if the user explicitly grants permission in the direct chat transcript.

## STRICT POLICY: Prompt Engine Frozen Guard
- **Rule:** Do NOT modify, rewrite, delete, or append to any file within the `src/components/PromptEngine/` or `src/services/promptEngine/` directories under any circumstances.
- **Exception:** You may only modify these files if the user explicitly grants permission in the direct chat transcript (e.g., "I permit you to modify the prompt engine" or "Unlock the prompt engine section").
- **Action:** If changes are needed in this section, you MUST ask the user for permission in the chat first. Do not modify speculatively.
