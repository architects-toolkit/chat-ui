/*
 * chat-ui — default stylesheet (injected once per view unless `unstyled`).
 *
 * Every visual token is a CSS custom property under `--cui-*` so hosts
 * re-theme the view without forking the stylesheet.
 */

export const DEFAULT_STYLES = `
.chat-ui {
  --cui-bg: #ffffff;
  --cui-fg: #1c1c1e;
  --cui-muted: #6e6e73;
  --cui-border: #e3e3e6;
  --cui-accent: #4f7cff;
  --cui-accent-fg: #ffffff;
  --cui-user-bg: #eef2ff;
  --cui-assistant-bg: #f6f6f7;
  --cui-system-bg: transparent;
  --cui-error: #d34545;
  --cui-radius: 10px;
  --cui-font: inherit;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--cui-bg);
  color: var(--cui-fg);
  font: var(--cui-font);
}
.chat-ui[data-theme='dark'] {
  --cui-bg: #16161a;
  --cui-fg: #ececf1;
  --cui-muted: #9a9aa3;
  --cui-border: #2c2c32;
  --cui-user-bg: #26324f;
  --cui-assistant-bg: #202027;
}
.cui-status {
  flex: none;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--cui-muted);
  border-bottom: 1px solid var(--cui-border);
  min-height: 20px;
}
.cui-context-card {
  display: none;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--cui-muted);
  border-bottom: 1px solid var(--cui-border);
}
.cui-context-card.visible { display: flex; }
.cui-context-meter { flex: 1; height: 4px; background: var(--cui-border); border-radius: 2px; overflow: hidden; }
.cui-context-meter > i { display: block; height: 100%; background: var(--cui-accent); }
.cui-messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cui-msg { max-width: 85%; }
.cui-msg .cui-bubble {
  padding: 8px 12px;
  border-radius: var(--cui-radius);
  background: var(--cui-assistant-bg);
  word-break: break-word;
}
.cui-msg[data-role='user'] { align-self: flex-end; }
.cui-msg[data-role='user'] .cui-bubble { background: var(--cui-user-bg); }
.cui-msg[data-role='system'] { align-self: center; }
.cui-msg[data-role='system'] .cui-bubble { background: var(--cui-system-bg); color: var(--cui-muted); font-size: 12px; }
.cui-msg[data-role='tool'] { align-self: stretch; max-width: 100%; }
.cui-msg[data-role='tool'] .cui-bubble { font-size: 12px; }
.cui-msg[data-status='error'] .cui-bubble { outline: 1px solid var(--cui-error); }
.cui-msg pre { overflow-x: auto; }
.cui-msg code { font-family: ui-monospace, monospace; font-size: 0.92em; }
.cui-msg table { border-collapse: collapse; font-size: 0.92em; }
.cui-msg th, .cui-msg td { border: 1px solid var(--cui-border); padding: 3px 8px; }
.cui-msg blockquote { margin: 4px 0; padding-left: 10px; border-left: 3px solid var(--cui-border); color: var(--cui-muted); }
.cui-part-tool_call .cui-tool-name { font-weight: 600; }
.cui-part-tool_result { border-left: 2px solid var(--cui-border); padding-left: 8px; margin-top: 4px; white-space: pre-wrap; }
.cui-part-tool_result[data-error='true'] { border-color: var(--cui-error); color: var(--cui-error); }
.cui-part-image img { max-width: 100%; border-radius: calc(var(--cui-radius) - 2px); display: block; }
.cui-part-media audio, .cui-part-media video { max-width: 100%; border-radius: calc(var(--cui-radius) - 2px); }
.cui-media-name { font-size: 11px; color: var(--cui-muted); margin-top: 2px; }
.cui-part-quote { margin: 0; padding-left: 10px; border-left: 3px solid var(--cui-accent); }
.cui-quote-body { white-space: pre-wrap; }
.cui-quote-source { display: block; margin-top: 4px; font-size: 11px; color: var(--cui-muted); font-style: normal; }
.cui-usage { display: inline-block; margin-top: 6px; padding: 2px 8px; font-size: 11px; color: var(--cui-muted); border: 1px solid var(--cui-border); border-radius: 999px; }
.cui-evidence { display: flex; gap: 6px; font-size: 12px; color: var(--cui-muted); }
.cui-evidence[data-level='warning'] { color: #a07a1f; }
.cui-evidence[data-level='error'] { color: var(--cui-error); }
.cui-evidence-body { display: flex; flex-direction: column; min-width: 0; }
.cui-evidence-detail { font-size: 11px; opacity: 0.75; white-space: pre-wrap; }
.cui-suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.cui-suggestion {
  border: 1px solid var(--cui-border);
  background: transparent;
  color: var(--cui-fg);
  border-radius: 999px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: 12px;
}
.cui-suggestion:hover:not(:disabled) { border-color: var(--cui-accent); color: var(--cui-accent); }
.cui-suggestion:disabled { opacity: 0.55; cursor: default; }
.cui-card {
  border: 1px solid var(--cui-border);
  border-radius: var(--cui-radius);
  padding: 8px 10px;
  margin: 4px 0;
  font-size: 13px;
}
.cui-card-title { font-weight: 600; margin-bottom: 4px; }
.cui-card-desc { color: var(--cui-muted); margin-bottom: 6px; white-space: pre-wrap; }
.cui-card-actions { display: flex; gap: 6px; }
.cui-approve { border: none; border-radius: 6px; padding: 4px 12px; cursor: pointer; background: var(--cui-accent); color: var(--cui-accent-fg); font-weight: 600; }
.cui-reject { border: 1px solid var(--cui-border); border-radius: 6px; padding: 4px 12px; cursor: pointer; background: transparent; color: var(--cui-fg); }
.cui-approve:disabled, .cui-reject:disabled { opacity: 0.55; cursor: default; }
.cui-card[data-state='approved'] { border-color: #2f9e57; }
.cui-card[data-state='rejected'] { border-color: var(--cui-error); }
.cui-card-state { font-size: 12px; color: var(--cui-muted); font-style: italic; }
.cui-card-answer { margin-top: 4px; font-size: 12px; color: var(--cui-muted); font-style: italic; }
.cui-card[data-answered='true'] { opacity: 0.85; }
.cui-card-options { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; }
.cui-card-answer-row { display: flex; gap: 6px; margin-top: 6px; }
.cui-card-input {
  flex: 1; min-width: 0;
  border: 1px solid var(--cui-border);
  border-radius: 6px;
  padding: 4px 8px;
  font: inherit;
  color: var(--cui-fg);
  background: var(--cui-bg);
}
.cui-card-answer-row button {
  border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer;
  background: var(--cui-accent); color: var(--cui-accent-fg);
}
.cui-card-answer-row button:disabled { opacity: 0.55; cursor: default; }
.cui-card-modelrow { display: flex; align-items: center; gap: 8px; }
.cui-card-label { color: var(--cui-muted); font-size: 12px; }
.cui-task-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.cui-task-step { display: flex; gap: 8px; align-items: baseline; }
.cui-task-icon { flex: none; width: 1em; text-align: center; }
.cui-task-step[data-status='done'] .cui-task-icon { color: #2f9e57; }
.cui-task-step[data-status='active'] .cui-task-icon { color: var(--cui-accent); }
.cui-task-step[data-status='error'] .cui-task-icon { color: var(--cui-error); }
.cui-task-step[data-status='done'] .cui-task-label { text-decoration: line-through; color: var(--cui-muted); }
.cui-task-detail { color: var(--cui-muted); font-size: 11px; }
.cui-messages-wrap { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.cui-jump {
  display: none;
  position: absolute;
  right: 16px; bottom: 12px;
  border: 1px solid var(--cui-border);
  background: var(--cui-bg);
  color: var(--cui-fg);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.18);
}
.cui-jump.visible { display: block; }
.cui-attachments {
  display: none;
  flex: none;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px 0;
}
.cui-attachments.visible { display: flex; }
.cui-attachment {
  display: flex; align-items: center; gap: 6px;
  border: 1px solid var(--cui-border);
  border-radius: var(--cui-radius);
  padding: 4px 8px;
  font-size: 12px;
  max-width: 180px;
}
.cui-attachment-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: 6px; }
.cui-attachment-icon { font-size: 16px; }
.cui-attachment-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cui-attachment-rm { border: none; background: none; color: var(--cui-muted); cursor: pointer; padding: 0 2px; }
.cui-attachment-rm:hover { color: var(--cui-fg); }
.cui-model {
  flex: none; max-width: 140px;
  border: 1px solid var(--cui-border);
  border-radius: 6px;
  padding: 4px 6px;
  font: inherit; font-size: 12px;
  color: var(--cui-fg);
  background: var(--cui-bg);
}
.cui-actions { display: flex; gap: 6px; margin-top: 6px; }
.cui-actions button {
  border: 1px solid var(--cui-border);
  background: transparent;
  color: var(--cui-fg);
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
  font-size: 12px;
}
.cui-queue {
  display: none;
  flex: none;
  border-top: 1px solid var(--cui-border);
  max-height: 140px;
  overflow-y: auto;
}
.cui-queue.visible { display: block; }
.cui-queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--cui-border);
  font-size: 13px;
}
.cui-queue-item:last-child { border-bottom: none; }
.cui-queue-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cui-queue-item button {
  flex: none;
  border: none;
  background: transparent;
  color: var(--cui-muted);
  cursor: pointer;
  font-size: 12px;
}
.cui-queue-item button:hover { color: var(--cui-fg); }
.cui-quote {
  display: none;
  flex: none;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 12px 0;
  padding: 6px 10px;
  border-left: 3px solid var(--cui-accent);
  background: var(--cui-assistant-bg);
  border-radius: 0 var(--cui-radius) var(--cui-radius) 0;
  font-size: 12px;
}
.cui-quote.visible { display: flex; }
.cui-quote-text { flex: 1; white-space: pre-wrap; max-height: 64px; overflow: hidden; }
.cui-quote button { border: none; background: none; color: var(--cui-muted); cursor: pointer; }
.cui-composer {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--cui-border);
}
.cui-input {
  flex: 1;
  resize: none;
  border: 1px solid var(--cui-border);
  border-radius: var(--cui-radius);
  padding: 8px 10px;
  font: inherit;
  color: var(--cui-fg);
  background: var(--cui-bg);
  min-height: 20px;
  max-height: 160px;
}
.cui-send, .cui-cancel {
  flex: none;
  border: none;
  border-radius: var(--cui-radius);
  padding: 8px 14px;
  cursor: pointer;
  background: var(--cui-accent);
  color: var(--cui-accent-fg);
  font-weight: 600;
}
.cui-cancel { display: none; background: var(--cui-error); }
.chat-ui[data-processing='true'] .cui-send { display: none; }
.chat-ui[data-processing='true'] .cui-cancel { display: block; }
.cui-send:disabled { opacity: 0.5; cursor: default; }
@media (prefers-reduced-motion: reduce) {
  .chat-ui *, .chat-ui *::before, .chat-ui *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;
