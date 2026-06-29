import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface MenuProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: number;
}

/** Lightweight popover: opens under its trigger, closes on outside click / Esc. */
export function Menu({ trigger, children, align = "left", width = 200 }: MenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            [align]: 0,
            width,
            zIndex: 50,
            padding: 5,
            background: "var(--bg-sidebar)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 8px 28px -8px #1b1b1826, 0 2px 6px #1b1b1810",
            animation: "fadeUp .12s var(--ease)",
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  dot,
  active,
}: {
  children: ReactNode;
  onClick: () => void;
  dot?: string;
  active?: boolean;
}) {
  return (
    <button
      className="rw"
      role="menuitem"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 9px",
        border: "none",
        background: active ? "var(--hover-row)" : "transparent",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: 12.5,
        color: "var(--text-body)",
        textAlign: "left",
        fontFamily: "var(--font-sans)",
      }}
    >
      {dot && (
        <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: dot }} />
      )}
      <span style={{ flex: 1 }}>{children}</span>
    </button>
  );
}
