import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import {
  DECISION_COLOR,
  DECISION_LABEL,
  DECISION_STATUSES,
  type DecisionStatus,
} from "../../lib/decisions";
import { docToText, type PMNode } from "../../lib/doc";
import { logEvent } from "../../store/notes";
import { shortDate } from "../../lib/time";

interface DecisionOptions {
  /** the note this editor is bound to — status changes are logged to its provenance */
  noteId: string | null;
}

function DecisionView({ node, updateAttributes, extension }: NodeViewProps) {
  const status = (node.attrs.status as DecisionStatus) ?? "open";
  const decidedAt = node.attrs.decidedAt as number | null;

  const cycle = () => {
    const next = DECISION_STATUSES[(DECISION_STATUSES.indexOf(status) + 1) % DECISION_STATUSES.length];
    updateAttributes({ status: next, decidedAt: next === "open" ? null : Date.now() });
    const noteId = (extension.options as DecisionOptions).noteId;
    if (noteId) {
      const statement = docToText(node.content.firstChild?.toJSON() as PMNode) || "untitled";
      void logEvent(noteId, "decision_changed", `decision ${DECISION_LABEL[next].toLowerCase()}: “${statement}”`, {
        data: { decisionId: node.attrs.id, from: status, to: next },
      });
    }
  };

  return (
    <NodeViewWrapper className="loam-decision" data-status={status}>
      <div className="loam-decision-head" contentEditable={false}>
        <span className="loam-decision-label">Decision</span>
        <button
          type="button"
          className="loam-decision-status"
          style={{ color: DECISION_COLOR[status] }}
          title="Click to change status"
          onClick={cycle}
        >
          <span className="loam-decision-dot" style={{ background: DECISION_COLOR[status] }} />
          {DECISION_LABEL[status]}
        </button>
        {decidedAt && <span className="loam-decision-date">{shortDate(decidedAt)}</span>}
      </div>
      <NodeViewContent className="loam-decision-body" />
    </NodeViewWrapper>
  );
}

export const Decision = Node.create<DecisionOptions>({
  name: "decision",
  group: "block",
  content: "block+",
  defining: true,

  addOptions() {
    return { noteId: null };
  },

  addAttributes() {
    return {
      id: { default: null },
      status: { default: "open" },
      decidedAt: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-decision]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-decision": "" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DecisionView);
  },
});
