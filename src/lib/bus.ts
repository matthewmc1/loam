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
