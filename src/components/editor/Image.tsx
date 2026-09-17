import { Node, mergeAttributes, type Editor } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useAssetUrl } from "../useAssetUrl";
import { AssetError, ingestImage, isImageFile } from "../../lib/assets";
import { noticeBus } from "../../lib/bus";

type Size = "fit" | "wide";

function ImageView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const { assetId, caption, width, height } = node.attrs as { assetId: string; caption: string; width: number; height: number };
  const size = (node.attrs.size as Size) ?? "fit";
  const url = useAssetUrl(assetId);
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper as="figure" className={"loam-figure" + (selected ? " is-selected" : "")} data-size={size} data-drag-handle>
      <div
        className="loam-figure-frame"
        // reserve the box before the bytes arrive — no layout jump while loading
        style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined}
      >
        {url ? (
          <img src={url} alt={caption} draggable={false} />
        ) : (
          <div className="loam-figure-empty">{url === null ? "Image missing from this vault" : ""}</div>
        )}
        {editable && (
          <div className="loam-figure-tools" contentEditable={false}>
            <button type="button" onClick={() => updateAttributes({ size: size === "fit" ? "wide" : "fit" })}>
              {size === "fit" ? "Wider" : "Narrower"}
            </button>
            <button type="button" onClick={deleteNode} aria-label="Remove image">
              Remove
            </button>
          </div>
        )}
      </div>
      {(editable || caption) && (
        <input
          className="loam-figure-caption"
          value={caption}
          readOnly={!editable}
          placeholder="Add a caption…"
          aria-label="Image caption"
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          // the caption is an input inside a ProseMirror atom: keep its keys to itself
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              editor.commands.focus();
            }
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const LoamImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      assetId: { default: null },
      caption: { default: "" },
      size: { default: "fit" },
      width: { default: 0 },
      height: { default: 0 },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-asset]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes({ "data-asset": HTMLAttributes.assetId })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

/**
 * Store the files and drop them into the doc at `pos` (default: the caret).
 * Returns true if any of `files` was an image — i.e. whether we handled the event.
 */
export function insertImages(editor: Editor, files: Iterable<File>, pos?: number): boolean {
  const images = [...files].filter(isImageFile);
  if (images.length === 0) return false;
  void (async () => {
    let at = pos;
    for (const file of images) {
      try {
        const a = await ingestImage(file);
        const node = { type: "image", attrs: { assetId: a.id, width: a.width, height: a.height, caption: "" } };
        if (at == null) editor.chain().focus().insertContent(node).run();
        else {
          editor.chain().focus().insertContentAt(at, node).run();
          at += 1;
        }
      } catch (e) {
        noticeBus.emit(e instanceof AssetError ? e.message : "That image couldn’t be added.");
      }
    }
  })();
  return true;
}

/** Open the OS file picker and hand back the chosen images. */
export function pickImages(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    // no reliable "cancelled" event everywhere; an unresolved promise here is harmless
    input.click();
  });
}
