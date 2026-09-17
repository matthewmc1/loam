import { useEffect, useState } from "react";
import { noticeBus } from "../lib/bus";

/** App-wide toast: one message at a time, bottom-centre, gone in a few seconds. */
export function Notices() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: number | undefined;
    const off = noticeBus.on((m) => {
      setMsg(m);
      window.clearTimeout(t);
      t = window.setTimeout(() => setMsg(null), 4200);
    });
    return () => {
      off();
      window.clearTimeout(t);
    };
  }, []);
  if (!msg) return null;
  return (
    <div role="status" aria-live="polite" style={toast}>
      {msg}
    </div>
  );
}

const toast: React.CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
  transform: "translateX(-50%)",
  zIndex: 1200,
  maxWidth: "min(420px, 90%)",
  background: "var(--text-strong)",
  color: "var(--bg-main)",
  borderRadius: 9,
  padding: "9px 14px",
  fontSize: 13,
  lineHeight: 1.45,
  boxShadow: "0 10px 30px -10px rgba(27, 27, 24, 0.4)",
  animation: "fadeUp 0.18s var(--ease-out)",
};
