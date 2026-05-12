import { useState } from "react";
import { Download, ChevronDown, ChevronUp, FileCode2, Image as ImageIcon, ArrowRight, Terminal } from "lucide-react";

// --- The Adobe Illustrator Script (runs inside Illustrator via File > Scripts > Other Script) ---
// This script loops through all open documents, exports a high-quality JPEG
// preview next to the EPS file, and names it identically (icon-1.eps → icon-1.jpg).
const ILLUSTRATOR_SCRIPT = `// ============================================================
// EPS Preview Exporter for AI Metadata Generator
// by matadata.app — Adobe Illustrator Script (.jsx)
//
// HOW TO USE:
// 1. Open your EPS files in Adobe Illustrator (File > Open)
// 2. Go to File > Scripts > Other Script...
// 3. Select this file and click Run
// 4. JPG previews will be saved next to each EPS file
// ============================================================

var docs = app.documents;

if (docs.length === 0) {
    alert("No documents are open. Please open your EPS files in Illustrator first.");
} else {
    var exported = 0;
    var failed = 0;

    for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];

        try {
            // Get file path — same folder as the EPS
            var srcFile = doc.fullName;
            var srcPath = srcFile.path;
            var baseName = srcFile.name.replace(/\\.eps$/i, "").replace(/\\.epsf$/i, "").replace(/\\.epsi$/i, "");
            var destFile = new File(srcPath + "/" + baseName + ".jpg");

            // JPEG export options
            var opts = new ExportOptionsJPEG();
            opts.qualitySetting = 90;
            opts.antiAliasing = true;
            opts.artboardClipping = true;
            opts.resolution = 150; // 150 DPI is enough for AI vision analysis

            doc.exportFile(destFile, ExportType.JPEG, opts);
            exported++;
        } catch (e) {
            failed++;
        }
    }

    alert("Export Complete!\\n\\n" +
          "✅ Exported: " + exported + " JPG preview(s)\\n" +
          (failed > 0 ? "❌ Failed: " + failed + " file(s)\\n\\n" : "\\n") +
          "Now go to matadata.app and upload BOTH your EPS and JPG files together.\\n" +
          "The AI will use the JPG to analyze your design!");
}`;

export function EpsGuide() {
  const [isOpen, setIsOpen] = useState(false);

  const downloadScript = () => {
    const blob = new Blob([ILLUSTRATOR_SCRIPT], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "eps_preview_exporter.jsx");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass" style={{ borderRadius: "1rem", overflow: "hidden" }}>
      {/* Header toggle */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.25rem",
          background: "linear-gradient(135deg, rgba(245,158,11,0.1), rgba(99,102,241,0.08))",
          border: "none",
          cursor: "pointer",
          borderRadius: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <FileCode2 style={{ width: "1.1rem", height: "1.1rem", color: "#f59e0b" }} />
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#f59e0b" }}>
            EPS ফাইলের জন্য AI Vision সক্রিয় করবেন কীভাবে?
          </span>
          <span style={{
            fontSize: "10px", fontWeight: 700, padding: "2px 7px",
            background: "rgba(245,158,11,0.2)", color: "#f59e0b",
            borderRadius: "9999px", border: "1px solid rgba(245,158,11,0.3)"
          }}>
            ১ মিনিটের সেটআপ
          </span>
        </div>
        {isOpen
          ? <ChevronUp style={{ width: "1rem", height: "1rem", color: "#94a3b8" }} />
          : <ChevronDown style={{ width: "1rem", height: "1rem", color: "#94a3b8" }} />
        }
      </button>

      {/* Expandable content */}
      {isOpen && (
        <div style={{ padding: "1.25rem", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          {/* Why section */}
          <div style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: "0.6rem",
            padding: "0.75rem 1rem",
            marginBottom: "1.25rem",
            fontSize: "0.8rem",
            color: "#fca5a5"
          }}>
            <strong>⚠ সমস্যা কী?</strong> ব্রাউজার EPS ফাইল রেন্ডার করতে পারে না। তাই AI সরাসরি আপনার ডিজাইন "দেখতে" পায় না। সমাধান হলো Adobe Illustrator দিয়ে একটি JPG Preview তৈরি করা।
          </div>

          {/* Steps */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <Step number="১" icon={<Download style={{ width: "1rem", height: "1rem" }} />}
              title="Script ডাউনলোড করুন"
              desc='নিচের বাটনে ক্লিক করে "eps_preview_exporter.jsx" ফাইলটি ডাউনলোড করুন।'
            />
            <Arrow />
            <Step number="২" icon={<Terminal style={{ width: "1rem", height: "1rem" }} />}
              title="Illustrator-এ Script চালান"
              desc='Adobe Illustrator খুলুন। আপনার EPS ফাইলগুলো Open করুন। তারপর: File → Scripts → Other Script → ডাউনলোড করা .jsx ফাইলটি সিলেক্ট করুন।'
            />
            <Arrow />
            <Step number="৩" icon={<ImageIcon style={{ width: "1rem", height: "1rem" }} />}
              title="EPS + JPG একসাথে আপলোড করুন"
              desc='Script রান হলে প্রতিটি EPS-এর পাশে একটি JPG তৈরি হবে (icon-1.eps → icon-1.jpg)। এখন উপরের Upload Zone-এ EPS এবং JPG দুটো ফাইলই একসাথে আপলোড করুন।'
            />
            <Arrow />
            <Step number="৪" icon={<FileCode2 style={{ width: "1rem", height: "1rem" }} />}
              title="AI আপনার আসল ডিজাইন দেখে Metadata তৈরি করবে"
              desc='App টি স্বয়ংক্রিয়ভাবে JPG ব্যবহার করে AI দিয়ে ডিজাইন বিশ্লেষণ করবে, কিন্তু CSV-এ EPS ফাইলের নামই থাকবে।'
              highlight
            />
          </div>

          {/* Download button */}
          <button
            onClick={downloadScript}
            style={{
              width: "100%",
              padding: "0.85rem",
              background: "linear-gradient(135deg, #d97706, #f59e0b)",
              color: "#1c1917",
              fontWeight: 800,
              fontSize: "0.95rem",
              border: "none",
              borderRadius: "0.6rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "opacity 0.2s"
            }}
            onMouseOver={e => e.currentTarget.style.opacity = "0.9"}
            onMouseOut={e => e.currentTarget.style.opacity = "1"}
          >
            <Download style={{ width: "1.1rem", height: "1.1rem" }} />
            Illustrator Script ডাউনলোড করুন (.jsx)
          </button>

          <p style={{ textAlign: "center", fontSize: "11px", color: "#64748b", marginTop: "0.6rem" }}>
            Adobe Illustrator CS6, CC 2015–2026 সাপোর্টেড • ফ্রি • ওপেন সোর্স
          </p>
        </div>
      )}
    </div>
  );
}

function Step({ number, icon, title, desc, highlight }) {
  return (
    <div style={{
      display: "flex",
      gap: "0.75rem",
      alignItems: "flex-start",
      background: highlight ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${highlight ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)"}`,
      borderRadius: "0.6rem",
      padding: "0.75rem"
    }}>
      <div style={{
        width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
        background: highlight ? "rgba(99,102,241,0.3)" : "rgba(245,158,11,0.2)",
        color: highlight ? "#a5b4fc" : "#f59e0b",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: "13px"
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: "0.2rem", color: highlight ? "#c7d2fe" : "#e2e8f0" }}>
          {number}. {title}
        </div>
        <div style={{ fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.6 }}>{desc}</div>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <ArrowRight style={{ width: "1rem", height: "1rem", color: "#475569", transform: "rotate(90deg)" }} />
    </div>
  );
}
