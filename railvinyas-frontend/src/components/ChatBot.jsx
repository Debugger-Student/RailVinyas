import { useState } from "react";
import { apiFetch } from "../api";

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sid, setSid] = useState(null);

  async function send() {
    const m = text.trim();
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
      setMsgs((x) => [...x, { who: "bot", t: e.message }]);
    }
    setBusy(false);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open && (
        <div className="w-80 h-96 bg-white border rounded-lg shadow-lg flex flex-col mb-2">
          <div className="p-3 border-b font-medium text-navy">RailVinyas Assistant</div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
            {msgs.map((m, i) => (
              <div key={i} className={m.who === "me" ? "text-right" : ""}>
                <span
                  className={
                    "inline-block px-3 py-2 rounded-lg whitespace-pre-wrap " +
                    (m.who === "me" ? "bg-sky text-white" : "bg-gray-100")
                  }
                >
                  {m.t}
                </span>
              </div>
            ))}
            {busy && <div className="text-gray-400">Thinking…</div>}
          </div>
          <div className="p-2 border-t flex gap-2">
            <input
              className="flex-1 border rounded px-2 py-1 text-sm"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button
              onClick={send}
              disabled={busy}
              className="px-3 py-1 bg-navy text-white rounded text-sm"
            >
              Send
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="px-4 py-2 bg-navy text-white rounded-full shadow"
      >
        {open ? "Close" : "Ask AI"}
      </button>
    </div>
  );
}