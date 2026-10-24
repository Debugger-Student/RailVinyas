import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";

const GRAD = "linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #d946ef 100%)";

const SUGGESTIONS = [
  "Show upcoming trains for AAG-MKPT",
  "Is the live data real for AAG-MKPT?",
  "Best hour for Track Repair on AAG-MKPT tomorrow?",
];

const Sparkle = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2zm7 11l.9 2.6L22.5 16.5l-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13zM6 14l.7 2 2 .7-2 .7L6 19.5l-.7-2-2-.7 2-.7L6 14z" />
  </svg>
);

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, open]);

  async function send(override) {
    const m = (override ?? text).trim();
    if (!m || busy) return;
    setText("");
    setBusy(true);
    setMsgs((x) => [...x, { who: "me", t: m }]);
    try {
      const d = await apiFetch("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ message: m, session_id: sid }),
      });
      setSid(d.session_id);
      setMsgs((x) => [...x, { who: "bot", t: d.reply }]);
    } catch (e) {
      setMsgs((x) => [...x, { who: "bot", t: e.message, err: true }]);
    }
    setBusy(false);
  }

  function clearChat() {
    setMsgs([]);
    setSid(null);
  }

  return (
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 50 }}>
      <style>{`
        @keyframes rvPulse { 0%{box-shadow:0 0 0 0 rgba(99,102,241,.55)} 70%{box-shadow:0 0 0 16px rgba(99,102,241,0)} 100%{box-shadow:0 0 0 0 rgba(99,102,241,0)} }
        @keyframes rvPop { from{opacity:0;transform:translateY(12px) scale(.97)} to{opacity:1;transform:none} }
        @keyframes rvDot { 0%,80%,100%{transform:scale(.6);opacity:.4} 40%{transform:scale(1);opacity:1} }
        .rv-dot{width:7px;height:7px;border-radius:50%;background:#6366f1;display:inline-block;margin:0 2px;animation:rvDot 1.2s infinite}
        .rv-dot:nth-child(2){animation-delay:.15s} .rv-dot:nth-child(3){animation-delay:.3s}
        .rv-chip:hover{background:#eef2ff;border-color:#a5b4fc}
      `}</style>

      {open && (
        <div
          style={{
            width: "min(400px, calc(100vw - 32px))",
            height: "min(600px, calc(100vh - 110px))",
            background: "#fff",
            borderRadius: 20,
            boxShadow: "0 20px 60px rgba(30,41,59,.28)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            marginBottom: 14,
            animation: "rvPop .2s ease-out",
            border: "1px solid #e2e8f0",
          }}
        >
          {/* Header */}
          <div style={{ background: GRAD, color: "#fff", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkle size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>RailVinyas AI</div>
              <div style={{ fontSize: 11, opacity: 0.9 }}>Railway block planning assistant</div>
            </div>
            <button onClick={clearChat} title="New chat" style={{ background: "rgba(255,255,255,.2)", color: "#fff", border: 0, borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
              New chat
            </button>
            <button onClick={() => setOpen(false)} title="Close" style={{ background: "transparent", color: "#fff", border: 0, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>
              ×
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16, background: "#f8fafc", display: "flex", flexDirection: "column", gap: 12 }}>
            {msgs.length === 0 && (
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>How can I help?</div>
                <div style={{ fontSize: 13, color: "#64748b", margin: "4px 0 14px" }}>
                  Ask about sections, trains, traffic or the best time for a maintenance block.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="rv-chip" onClick={() => send(s)}
                      style={{ textAlign: "left", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "#334155", cursor: "pointer" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.who === "me" ? "flex-end" : "flex-start", gap: 8 }}>
                {m.who === "bot" && (
                  <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 9, background: GRAD, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Sparkle size={14} />
                  </div>
                )}
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 13px",
                    fontSize: 14,
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    borderRadius: m.who === "me" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: m.who === "me" ? GRAD : m.err ? "#fef2f2" : "#fff",
                    color: m.who === "me" ? "#fff" : m.err ? "#b91c1c" : "#1e293b",
                    border: m.who === "me" ? 0 : "1px solid #e2e8f0",
                  }}
                >
                  {m.t}
                </div>
              </div>
            ))}

            {busy && (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ width: 26, height: 26, borderRadius: 9, background: GRAD, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Sparkle size={14} />
                </div>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "10px 14px" }}>
                  <span className="rv-dot" /><span className="rv-dot" /><span className="rv-dot" />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: "1px solid #e2e8f0", background: "#fff" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", border: "1.5px solid #c7d2fe", borderRadius: 14, padding: "6px 6px 6px 12px" }}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask RailVinyas AI…"
                style={{ flex: 1, border: 0, outline: "none", fontSize: 14, background: "transparent" }}
              />
              <button
                onClick={() => send()}
                disabled={busy || !text.trim()}
                style={{ background: GRAD, color: "#fff", border: 0, borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy || !text.trim() ? 0.5 : 1 }}
              >
                Send
              </button>
            </div>
            <div style={{ fontSize: 10.5, color: "#94a3b8", textAlign: "center", marginTop: 6 }}>
              AI can make mistakes. Recommendations are suggestions, not approvals.
            </div>
          </div>
        </div>
      )}

      {/* Launcher */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            background: GRAD,
            color: "#fff",
            border: 0,
            borderRadius: 999,
            padding: open ? "14px" : "14px 22px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(99,102,241,.45)",
            animation: open ? "none" : "rvPulse 2.2s infinite",
          }}
        >
          <Sparkle size={20} />
          {!open && "Ask AI"}
        </button>
      </div>
    </div>
  );
}