import { useState, useEffect } from "react";
import { Plus, Trash2, Key, CheckCircle, AlertCircle } from "lucide-react";

export function ApiKeyManager({ onKeysChange }) {
  const [keys, setKeys] = useState(() => {
    const saved = localStorage.getItem("gemini_keys");
    return saved ? JSON.parse(saved) : [];
  });
  const [newKey, setNewKey] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    localStorage.setItem("gemini_keys", JSON.stringify(keys));
    onKeysChange(keys);
  }, [keys, onKeysChange]);

  const addKey = () => {
    if (newKey.trim() && !keys.includes(newKey.trim())) {
      setKeys([...keys, newKey.trim()]);
      setNewKey("");
    }
  };

  const removeKey = (index) => {
    setKeys(keys.filter((_, i) => i !== index));
  };

  return (
    <div className="glass card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="flex items-center gap-2">
          <Key className="w-5 h-5 text-accent" />
          Gemini API Keys
          <span className="text-muted ml-2 text-sm italic">({keys.length} keys added)</span>
        </h2>
      </div>

      <div className="space-y-4 flex-grow">
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="Paste Gemini API Key here..."
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && addKey()}
          />
          <button className="btn-primary shrink-0" onClick={addKey}>
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        <p className="text-xs text-muted flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-accent" />
          Keys are saved locally in your browser and used sequentially to avoid rate limits.
        </p>

        <div className="space-y-2">
          {keys.length === 0 && (
            <div className="text-center p-4 border border-dashed border-glass-border rounded">
              <p className="text-muted mb-2 text-sm">No API keys found. You need at least one to start.</p>
            </div>
          )}
          {keys.map((key, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 rounded bg-opacity-20 bg-white"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <CheckCircle className="w-4 h-4 text-primary" />
                <span className="text-xs font-mono truncate">
                  {key.substring(0, 8)}••••••••{key.slice(-4)}
                </span>
              </div>
              <button
                className="p-1 hover:text-red-500 transition-colors"
                onClick={() => removeKey(index)}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
