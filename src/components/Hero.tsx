import { useRef, useState } from "react";
import type { Note } from "../db/types";
import { setHero, setHeroPosition } from "../store/notes";
import { AssetError, ingestImage } from "../lib/assets";
import { noticeBus } from "../lib/bus";
import { pickImages } from "./editor/Image";
import { useAssetUrl } from "./useAssetUrl";

async function chooseHero(noteId: string, file?: File) {
  const picked = file ?? (await pickImages(false))[0];
  if (!picked) return;
  try {
    const asset = await ingestImage(picked);
    await setHero(noteId, asset.id);
  } catch (e) {
    noticeBus.emit(e instanceof AssetError ? e.message : "That image couldn’t be added.");
  }
}

/** The quiet "add a cover" affordance that sits above the title of a note without one. */
export function AddHero({ note }: { note: Note }) {
  if (note.heroAssetId) return null;
  return (
    <button type="button" className="loam-hero-add" onClick={() => void chooseHero(note.id)}>
      + Add cover
    </button>
  );
}

/**
 * A note's cover: full-bleed across the writing column, cropped to a band.
 * The crop's focal point is set by dragging in "Reposition" mode.
 */
export function Hero({ note }: { note: Note }) {
  const url = useAssetUrl(note.heroAssetId);
  const [moving, setMoving] = useState(false);
  const [pos, setPos] = useState<number | null>(null); // live value while dragging
  const drag = useRef<{ y: number; start: number; height: number } | null>(null);
  const [over, setOver] = useState(false);

  if (!note.heroAssetId) return null;
  const position = pos ?? note.heroPosition ?? 50;

  const finish = () => {
    if (pos != null) void setHeroPosition(note.id, pos);
    setMoving(false);
    setPos(null);
  };

  return (
    <div
      className={"loam-hero" + (moving ? " is-moving" : "") + (over ? " is-over" : "")}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === "file")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = [...e.dataTransfer.files][0];
        if (f) void chooseHero(note.id, f);
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          style={{ objectPosition: `50% ${position}%` }}
          onPointerDown={(e) => {
            if (!moving) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { y: e.clientY, start: position, height: e.currentTarget.clientHeight };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            // dragging down reveals more of the top → focal point moves up
            setPos(Math.max(0, Math.min(100, d.start - ((e.clientY - d.y) / d.height) * 100)));
          }}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        />
      ) : (
        <div className="loam-hero-empty">{url === null ? "Cover image missing from this vault" : ""}</div>
      )}
      <div className="loam-hero-tools">
        {moving ? (
          <>
            <span className="loam-hero-hint">Drag the image to reposition</span>
            <button type="button" onClick={finish}>
              Done
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setMoving(true)} disabled={!url}>
              Reposition
            </button>
            <button type="button" onClick={() => void chooseHero(note.id)}>
              Change
            </button>
            <button type="button" onClick={() => void setHero(note.id, null)}>
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}
