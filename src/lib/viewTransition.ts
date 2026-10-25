import {flushSync} from 'react-dom';

type ViewTransition = {finished: Promise<void>};
type TransitionDocument = Document & {startViewTransition?: (update: () => void) => ViewTransition};

/** Stable view-transition-name for a question, shared by its list row and its detail card. */
export const questionTransitionName = (id: string) => `q-${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

// Rows carry a name only while a transition runs: every named element is a
// separate snapshot, and naming a whole page of rows makes the capture slow.
const MAX_GLIDING_ROWS = 16;
const named = new Set<HTMLElement>();

function nameElement(el: HTMLElement | null | undefined, id: string | undefined) {
  if (!el || !id) return;
  el.style.viewTransitionName = questionTransitionName(id);
  named.add(el);
}

function clearNames() {
  named.forEach(el => { el.style.viewTransitionName = ''; });
  named.clear();
}

/** Names the question row that contains `el`, so it can expand into its detail card. */
export function nameQuestionRowOf(el: Element | null) {
  const row = el?.closest<HTMLElement>('[data-question-id]');
  nameElement(row, row?.dataset.questionId);
}

/** Names the row of a given question after it renders, so the detail card can return into it. */
export function nameQuestionRow(id: string | null | undefined) {
  if (!id) return;
  const row = document.querySelector<HTMLElement>(`[data-question-id="${CSS.escape(id)}"]`);
  nameElement(row, id);
}

function nameVisibleRows() {
  let count = 0;
  for (const row of document.querySelectorAll<HTMLElement>('[data-question-id]')) {
    const box = row.getBoundingClientRect();
    if (box.bottom <= 0 || box.top >= innerHeight) continue;
    nameElement(row, row.dataset.questionId);
    if (++count >= MAX_GLIDING_ROWS) break;
  }
}

function canTransition(doc: TransitionDocument) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return Boolean(doc.startViewTransition) && !reduced;
}

/**
 * Runs a React state update inside a view transition. With `glide`, the rows on
 * screen move to their new place instead of jumping; `after` runs once the new
 * state has rendered, before it is captured. Without support, or with reduced
 * motion requested, the update applies immediately.
 */
export function viewTransition(update: () => void, options: {glide?: boolean; after?: () => void} = {}) {
  if (typeof document === 'undefined') return update();
  const doc = document as TransitionDocument;
  if (!canTransition(doc)) {
    clearNames();
    return update();
  }
  if (options.glide) nameVisibleRows();
  const transition = doc.startViewTransition!(() => {
    flushSync(update);
    options.after?.();
  });
  transition.finished.finally(clearNames);
}
