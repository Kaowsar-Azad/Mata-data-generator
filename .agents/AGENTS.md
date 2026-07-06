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
