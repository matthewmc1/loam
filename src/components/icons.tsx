/** Icon set transcribed from Loam.dc.html. All inherit `currentColor`. */

interface IconProps {
  size?: number;
}

export function CadenceIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
      <path d="M2.5 4.2 4 5.7l2.3-2.6" />
      <path d="M2.5 11.2 4 12.7l2.3-2.6" />
      <path d="M8.5 4.4h5M8.5 11.4h5" />
    </svg>
  );
}

export function GearIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.1" />
      <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5 3.4 3.4" />
    </svg>
  );
}

export function ResurfaceIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
      <path d="M13.8 8a5.8 5.8 0 1 1-1.7-4.1" />
      <path d="M13.8 2.4V5.2H11" />
    </svg>
  );
}

export function AskIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round">
      <path d="M8.5 2.3c.45 2.7 1.8 4.05 4.5 4.5-2.7.45-4.05 1.8-4.5 4.5-.45-2.7-1.8-4.05-4.5-4.5 2.7-.45 4.05-1.8 4.5-4.5Z" />
    </svg>
  );
}

export function SearchIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth={1.4}>
      <circle cx="5.5" cy="5.5" r="3.6" />
      <path d="M8.4 8.4 11 11" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M6.5 2.5v8M2.5 6.5h8" />
    </svg>
  );
}

export function InspectorIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}>
      <rect x="1.6" y="2.6" width="12.8" height="10.8" rx="1.6" />
      <path d="M10 2.6v10.8" />
    </svg>
  );
}

export function CaretIcon({ size = 9, open = false }: IconProps & { open?: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: size,
        color: "var(--text-faint)",
        width: 9,
        transition: "transform .14s var(--ease)",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
      }}
    >
      ▶
    </span>
  );
}

export function FolderPlusIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 3.4c0-.6.5-1 1-1h2.7l1 1.3h4.3c.5 0 1 .4 1 1v5.4c0 .6-.5 1-1 1H2.5c-.5 0-1-.4-1-1z" />
      <path d="M7 6v3M5.5 7.5h3" />
    </svg>
  );
}

export function ArchiveIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round">
      <rect x="2" y="3" width="12" height="3" rx="0.8" />
      <path d="M3 6v6.2c0 .5.4.8.8.8h8.4c.4 0 .8-.3.8-.8V6" />
      <path d="M6.4 9h3.2" strokeLinecap="round" />
    </svg>
  );
}

export function AiIcon({ size = 17 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round">
      <rect x="4.5" y="4.5" width="9" height="9" rx="2" />
      <path d="M7 1.6v2M11 1.6v2M7 14.4v2M11 14.4v2M1.6 7h2M1.6 11h2M14.4 7h2M14.4 11h2" />
      <circle cx="9" cy="9" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CheckIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 7.5 6 11l5.5-7" />
    </svg>
  );
}

export function CloseIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
    </svg>
  );
}
