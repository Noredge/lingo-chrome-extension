// These editors own a separate document model; native DOM replacement is unsafe.
// Keep the selection panel and inline checker on the same conservative boundary.
export const UNSUPPORTED_EDITOR_SELECTOR='.monaco-editor,.CodeMirror,.cm-editor,.ProseMirror,.tiptap,[data-lexical-editor],[data-slate-editor],.ql-editor,.DraftEditor-root,.public-DraftEditor-content,.ck-editor__editable,.mce-content-body,.kix-appview-editor,[inert],[aria-readonly="true"],[aria-disabled="true"]';
export function unsupportedEditor(element:HTMLElement):boolean {
  return !!element.closest(UNSUPPORTED_EDITOR_SELECTOR)||!!element.querySelector(UNSUPPORTED_EDITOR_SELECTOR);
}
