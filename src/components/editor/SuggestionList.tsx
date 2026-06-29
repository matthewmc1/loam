import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";

export interface SuggestionItem {
  id: string;
  primary: string;
  secondary?: string;
  dotColor?: string;
  isCreate?: boolean;
  /** raw payload to insert (note title or tag name); defaults to `primary`. */
  value?: string;
}

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface Props {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
}

export const SuggestionList = forwardRef<SuggestionListHandle, Props>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    const select = (i: number) => {
      const item = items[i];
      if (item) command(item);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (event.key === "ArrowDown") {
          setSelected((s) => (s + 1) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((s) => (s - 1 + items.length) % Math.max(items.length, 1));
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          select(selected);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;

    return (
      <div style={wrap}>
        {items.map((item, i) => (
          <button
            key={item.id}
            style={{
              ...row,
              background: i === selected ? "var(--hover-row)" : "transparent",
            }}
            onMouseMove={() => setSelected(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              command(item);
            }}
          >
            {item.isCreate ? (
              <span style={createGlyph}>+</span>
            ) : (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: item.dotColor ?? "var(--text-fainter)",
                }}
              />
            )}
            <span style={primaryStyle}>{item.primary}</span>
            {item.secondary && <span style={secondaryStyle}>{item.secondary}</span>}
          </button>
        ))}
      </div>
    );
  }
);
SuggestionList.displayName = "SuggestionList";

const wrap: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  width: 290,
  maxHeight: 280,
  overflowY: "auto",
  padding: 5,
  background: "var(--bg-sidebar)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  boxShadow: "0 8px 28px -8px #1b1b1826, 0 2px 6px #1b1b1810",
  animation: "fadeUp .12s var(--ease)",
};
const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  padding: "7px 9px",
  border: "none",
  borderRadius: 7,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "var(--font-sans)",
};
const primaryStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  color: "var(--text-body)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const secondaryStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  color: "var(--text-fainter)",
};
const createGlyph: React.CSSProperties = {
  width: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--text-muted)",
  fontWeight: 600,
};
