/**
 * Tiny event bus so in-editor wikilinks (rendered deep inside ProseMirror)
 * can ask the app to navigate without prop-drilling through the editor.
 */
type NavHandler = (payload: { id: string | null; title: string }) => void;

const navHandlers = new Set<NavHandler>();

export const navBus = {
  emit(payload: { id: string | null; title: string }) {
    navHandlers.forEach((h) => h(payload));
  },
  on(h: NavHandler) {
    navHandlers.add(h);
    return () => {
      navHandlers.delete(h);
    };
  },
};

type TagHandler = (tag: string) => void;
const tagHandlers = new Set<TagHandler>();

export const tagBus = {
  emit(tag: string) {
    tagHandlers.forEach((h) => h(tag));
  },
  on(h: TagHandler) {
    tagHandlers.add(h);
    return () => {
      tagHandlers.delete(h);
    };
  },
};

/** The insert menu asking the editor's link bubble to open at the caret. */
const linkHandlers = new Set<() => void>();

export const linkBus = {
  emit() {
    linkHandlers.forEach((h) => h());
  },
  on(h: () => void) {
    linkHandlers.add(h);
    return () => {
      linkHandlers.delete(h);
    };
  },
};

/** One-line, transient messages for the person (a failed image, a full disk). */
const noticeHandlers = new Set<(msg: string) => void>();

export const noticeBus = {
  emit(msg: string) {
    noticeHandlers.forEach((h) => h(msg));
  },
  on(h: (msg: string) => void) {
    noticeHandlers.add(h);
    return () => {
      noticeHandlers.delete(h);
    };
  },
};
