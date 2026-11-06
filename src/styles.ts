/*
 * chat-ui — default stylesheet (injected once per view unless `unstyled`).
 *
 * Every visual is driven by a `--cui-*` custom property so hosts re-theme
 * the view through configuration: palette, typography, rhythm, shape and
 * elevation are all tokens. `options.extraCss` appends a second sheet for
 * overrides; `data-theme='dark'` swaps the palette. Defaults below are the
 * shipped look — overriding a token never breaks the layout contract.
 */

export const DEFAULT_STYLES = `
.chat-ui {
  --cui-bg: #ffffff;
  --cui-fg: #1c1c1e;
  --cui-muted: #6e6e73;
  --cui-border: #e3e3e6;
  --cui-accent: #4f7cff;
  --cui-accent-fg: #ffffff;
  --cui-accent-subtle: transparent;
  --cui-user-bg: #eef2ff;
  --cui-assistant-bg: #f6f6f7;
  --cui-system-bg: transparent;
  --cui-error: #d34545;
  --cui-ok: rgb(47,158,87);
  --cui-warn: rgb(160,122,31);
  --cui-radius: 10px;
  --cui-border-width: 1px;
  --cui-shadow: 0 1px 4px rgba(0,0,0,0.18);
  --cui-shadow-sm: none;
  --cui-bubble-maxw: 85%;
  --cui-gap: 10px;
  --cui-pad: 8px 12px;
  --cui-font: inherit;
  --cui-font-size: inherit;
  --cui-font-size-sm: 12px;
  --cui-font-mono: ui-monospace, monospace;
  --cui-line-height: inherit;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--cui-bg);
  color: var(--cui-fg);
  font: var(--cui-font);
  font-size: var(--cui-font-size);
  line-height: var(--cui-line-height);
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
  font-size: var(--cui-font-size-sm);
  color: var(--cui-muted);
  border-bottom: var(--cui-border-width) solid var(--cui-border);
  min-height: 20px;
}
.cui-context-card {
  display: none;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: calc(var(--cui-font-size-sm) - 1px);
  color: var(--cui-muted);
  border-bottom: var(--cui-border-width) solid var(--cui-border);
}
.cui-context-card.visible { display: flex; }
.cui-context-meter { flex: 1; height: 4px; background: var(--cui-border); border-radius: calc(var(--cui-radius) - 8px); overflow: hidden; }
.cui-context-meter > i { display: block; height: 100%; background: var(--cui-accent); }
.cui-messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: var(--cui-gap);
}
.cui-msg { max-width: var(--cui-bubble-maxw); }
.cui-msg .cui-bubble {
  padding: var(--cui-pad);
  border-radius: var(--cui-radius);
  background: var(--cui-assistant-bg);
  word-break: break-word;
}
.cui-msg[data-role='user'] { align-self: flex-end; }
.cui-msg[data-role='user'] .cui-bubble { background: var(--cui-user-bg); }
.cui-msg[data-role='system'] { align-self: center; }
.cui-msg[data-role='system'] .cui-bubble { background: var(--cui-system-bg); color: var(--cui-muted); font-size: var(--cui-font-size-sm); }
.cui-msg[data-role='tool'] { align-self: stretch; max-width: 100%; }
.cui-msg[data-role='tool'] .cui-bubble { font-size: var(--cui-font-size-sm); }
.cui-msg[data-status='error'] .cui-bubble { outline: var(--cui-border-width) solid var(--cui-error); }
.cui-msg pre { overflow-x: auto; }
.cui-msg code { font-family: var(--cui-font-mono); font-size: 0.92em; }
.cui-msg table { border-collapse: collapse; font-size: 0.92em; }
.cui-msg th, .cui-msg td { border: var(--cui-border-width) solid var(--cui-border); padding: 3px 8px; }
.cui-msg blockquote { margin: 4px 0; padding-left: 10px; border-left: calc(var(--cui-border-width) + 2px) solid var(--cui-border); color: var(--cui-muted); }
.cui-part-tool_call .cui-tool-name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.cui-tool-queued { width: 0.85em; height: 0.85em; border: 2px solid var(--cui-muted); border-radius: 50%; display: inline-block; opacity: .45; flex: none; }
.cui-tool-spinner { width: 0.85em; height: 0.85em; border: 2px solid var(--cui-muted); border-top-color: transparent; border-radius: 50%; display: inline-block; animation: cui-tool-spin 0.9s linear infinite; flex: none; }
@keyframes cui-tool-spin { to { transform: rotate(360deg); } }
.cui-tool-glyph { flex: none; }
.cui-part-tool_call[data-status='done'] .cui-tool-glyph { color: var(--cui-ok); }
.cui-part-tool_call[data-status='error'] .cui-tool-glyph { color: var(--cui-error); }
.cui-part-tool_result { border-left: calc(var(--cui-border-width) + 1px) solid var(--cui-border); padding-left: 8px; margin-top: 4px; white-space: pre-wrap; }
.cui-tool-result-name { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.cui-tool-result-content { white-space: pre-wrap; }
.cui-part-tool_result[data-error='true'] { border-color: var(--cui-error); color: var(--cui-error); }
.cui-part-image img { max-width: 100%; border-radius: calc(var(--cui-radius) - 2px); display: block; }
.cui-part-media audio, .cui-part-media video { max-width: 100%; border-radius: calc(var(--cui-radius) - 2px); }
.cui-media-name { font-size: calc(var(--cui-font-size-sm) - 1px); color: var(--cui-muted); margin-top: 2px; }
.cui-part-quote { margin: 0; padding-left: 10px; border-left: calc(var(--cui-border-width) + 2px) solid var(--cui-accent); }
.cui-quote-body { white-space: pre-wrap; }
.cui-quote-source { display: block; margin-top: 4px; font-size: calc(var(--cui-font-size-sm) - 1px); color: var(--cui-muted); font-style: normal; }
.cui-usage { display: inline-block; margin-top: 6px; padding: 2px 8px; font-size: calc(var(--cui-font-size-sm) - 1px); color: var(--cui-muted); background: var(--cui-accent-subtle); border: var(--cui-border-width) solid var(--cui-border); border-radius: 999px; }
.cui-evidence { display: flex; gap: 6px; font-size: var(--cui-font-size-sm); color: var(--cui-muted); }
.cui-evidence[data-level='warning'] { color: var(--cui-warn); }
.cui-evidence[data-level='error'] { color: var(--cui-error); }
.cui-evidence-body { display: flex; flex-direction: column; min-width: 0; }
.cui-evidence-detail { font-size: calc(var(--cui-font-size-sm) - 1px); opacity: 0.75; white-space: pre-wrap; }
.cui-references {
  margin-top: 8px;
  padding-top: 6px;
  border-top: var(--cui-border-width) solid var(--cui-border);
  font-size: var(--cui-font-size-sm);
}
.cui-references-summary {
  cursor: pointer;
  color: var(--cui-muted);
  font-size: calc(var(--cui-font-size-sm) - 1px);
  font-weight: 600;
  user-select: none;
}
.cui-references-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cui-reference { display: flex; gap: 6px; align-items: baseline; }
.cui-ref-key { flex: none; color: var(--cui-muted); font-size: calc(var(--cui-font-size-sm) - 1px); }
.cui-ref-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cui-ref-title {
  color: var(--cui-fg);
  font-size: var(--cui-font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
}
a.cui-ref-title { color: var(--cui-accent); text-decoration: none; }
a.cui-ref-title:hover { text-decoration: underline; }
.cui-ref-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: calc(var(--cui-font-size-sm) - 1px); color: var(--cui-muted); }
.cui-ref-source { border: var(--cui-border-width) solid var(--cui-border); border-radius: 999px; padding: 0 6px; background: var(--cui-accent-subtle); }
.cui-ref-verified { color: var(--cui-ok); }
.cui-ref-snippet {
  color: var(--cui-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cui-suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.cui-suggestion {
  border: var(--cui-border-width) solid var(--cui-border);
  background: transparent;
  color: var(--cui-fg);
  border-radius: 999px;
  padding: 4px 12px;
  cursor: pointer;
  font-size: var(--cui-font-size-sm);
  box-shadow: var(--cui-shadow-sm);
}
.cui-suggestion:hover:not(:disabled) { border-color: var(--cui-accent); color: var(--cui-accent); background: var(--cui-accent-subtle); }
.cui-suggestion:disabled { opacity: 0.55; cursor: default; }
.cui-card {
  border: var(--cui-border-width) solid var(--cui-border);
  border-radius: var(--cui-radius);
  padding: 8px 10px;
  margin: 4px 0;
  font-size: calc(var(--cui-font-size-sm) + 1px);
  box-shadow: var(--cui-shadow-sm);
}
.cui-card-title { font-weight: 600; margin-bottom: 4px; }
.cui-card-desc { color: var(--cui-muted); margin-bottom: 6px; white-space: pre-wrap; }
.cui-card-actions { display: flex; gap: 6px; }
.cui-approve { border: none; border-radius: calc(var(--cui-radius) - 4px); padding: 4px 12px; cursor: pointer; background: var(--cui-accent); color: var(--cui-accent-fg); font-weight: 600; }
.cui-reject { border: var(--cui-border-width) solid var(--cui-border); border-radius: calc(var(--cui-radius) - 4px); padding: 4px 12px; cursor: pointer; background: transparent; color: var(--cui-fg); }
.cui-approve:disabled, .cui-reject:disabled { opacity: 0.55; cursor: default; }
.cui-card[data-state='approved'] { border-color: var(--cui-ok); }
.cui-card[data-state='rejected'] { border-color: var(--cui-error); }
.cui-card-state { font-size: var(--cui-font-size-sm); color: var(--cui-muted); font-style: italic; }
.cui-card-answer { margin-top: 4px; font-size: var(--cui-font-size-sm); color: var(--cui-muted); font-style: italic; }
.cui-card[data-answered='true'] { opacity: 0.85; }
.cui-card-options { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; }
.cui-card-answer-row { display: flex; gap: 6px; margin-top: 6px; }
.cui-card-input {
  flex: 1; min-width: 0;
  border: var(--cui-border-width) solid var(--cui-border);
  border-radius: calc(var(--cui-radius) - 4px);
  padding: 4px 8px;
  font: inherit;
  color: var(--cui-fg);
  background: var(--cui-bg);
}
.cui-card-answer-row button {
  border: none; border-radius: calc(var(--cui-radius) - 4px); padding: 4px 10px; cursor: pointer;
  background: var(--cui-accent); color: var(--cui-accent-fg);
}
.cui-card-answer-row button:disabled { opacity: 0.55; cursor: default; }
.cui-card-modelrow { display: flex; align-items: center; gap: 8px; }
.cui-card-label { color: var(--cui-muted); font-size: var(--cui-font-size-sm); }
.cui-task-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.cui-task-step { display: flex; gap: 8px; align-items: baseline; }
.cui-task-icon { flex: none; width: 1em; text-align: center; }
.cui-task-step[data-status='done'] .cui-task-icon { color: var(--cui-ok); }
.cui-task-step[data-status='active'] .cui-task-icon { color: var(--cui-accent); }
.cui-task-step[data-status='error'] .cui-task-icon { color: var(--cui-error); }
.cui-task-step[data-status='done'] .cui-task-label { text-decoration: line-through; color: var(--cui-muted); }
.cui-task-detail { color: var(--cui-muted); font-size: calc(var(--cui-font-size-sm) - 1px); }
/* subagent_run card */
.cui-subagent-head { display: flex; align-items: center; gap: 8px; min-width: 0; }
.cui-subagent-badge {
  flex: none;
  font-size: calc(var(--cui-font-size-sm) - 2px);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: var(--cui-border-width) solid var(--cui-border);
  border-radius: 999px;
  padding: 1px 8px;
  color: var(--cui-muted);
}
.cui-subagent-badge[data-tone='accent'] { color: var(--cui-accent); border-color: var(--cui-accent); background: var(--cui-accent-subtle); animation: cui-subagent-pulse 1.6s ease-in-out infinite; }
.cui-subagent-badge[data-tone='ok'] { color: var(--cui-ok); border-color: var(--cui-ok); }
.cui-subagent-badge[data-tone='err'] { color: var(--cui-error); border-color: var(--cui-error); }
.cui-subagent-badge[data-tone='warn'] { color: var(--cui-warn); border-color: var(--cui-warn); }
.cui-subagent-badge[data-tone='muted'] { opacity: 0.7; }
@keyframes cui-subagent-pulse { 50% { opacity: 0.45; } }
.cui-subagent-name { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cui-subagent-id { flex: none; color: var(--cui-muted); font-size: calc(var(--cui-font-size-sm) - 1px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cui-subagent-elapsed { flex: none; margin-left: auto; color: var(--cui-muted); font-size: calc(var(--cui-font-size-sm) - 1px); }
.cui-subagent-cancel {
  flex: none;
  border: var(--cui-border-width) solid var(--cui-error);
  background: transparent;
  color: var(--cui-error);
  border-radius: calc(var(--cui-radius) - 4px);
  padding: 2px 10px;
  cursor: pointer;
  font-size: var(--cui-font-size-sm);
}
.cui-subagent-cancel:hover:not(:disabled) { background: var(--cui-error); color: var(--cui-accent-fg); }
.cui-subagent-cancel:disabled { opacity: 0.55; cursor: default; }
.cui-subagent-task { margin-top: 6px; }
.cui-subagent-detail { margin-top: 2px; font-size: var(--cui-font-size-sm); color: var(--cui-muted); white-space: pre-wrap; }
.cui-subagent-progressrow { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.cui-subagent-progress { flex: 1; height: 4px; background: var(--cui-border); border-radius: calc(var(--cui-radius) - 8px); overflow: hidden; }
.cui-subagent-progress > i { display: block; height: 100%; background: var(--cui-accent); }
.cui-subagent-progress-label { flex: none; font-size: calc(var(--cui-font-size-sm) - 1px); color: var(--cui-muted); }
.cui-subagent-output { margin-top: 6px; padding-top: 4px; border-top: var(--cui-border-width) solid var(--cui-border); }
.cui-subagent-output-summary { cursor: pointer; color: var(--cui-muted); font-size: calc(var(--cui-font-size-sm) - 1px); font-weight: 600; user-select: none; }
.cui-subagent-output-pre {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--cui-font-size-sm);
  color: var(--cui-muted);
  display: -webkit-box;
  -webkit-line-clamp: 8;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.cui-messages-wrap { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.cui-jump {
  display: none;
  position: absolute;
  right: 16px; bottom: 12px;
  border: var(--cui-border-width) solid var(--cui-border);
  background: var(--cui-bg);
  color: var(--cui-fg);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: var(--cui-font-size-sm);
  cursor: pointer;
  box-shadow: var(--cui-shadow);
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
  border: var(--cui-border-width) solid var(--cui-border);
  border-radius: var(--cui-radius);
  padding: 4px 8px;
  font-size: var(--cui-font-size-sm);
  max-width: 180px;
  box-shadow: var(--cui-shadow-sm);
}
.cui-attachment-thumb { width: 32px; height: 32px; object-fit: cover; border-radius: calc(var(--cui-radius) - 4px); }
.cui-attachment-icon { font-size: calc(var(--cui-font-size-sm) + 4px); }
.cui-attachment-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cui-attachment-rm { border: none; background: none; color: var(--cui-muted); cursor: pointer; padding: 0 2px; }
.cui-attachment-rm:hover { color: var(--cui-fg); }
.cui-model {
  flex: none; max-width: 140px;
  border: var(--cui-border-width) solid var(--cui-border);
  border-radius: calc(var(--cui-radius) - 4px);
  padding: 4px 6px;
  font: inherit; font-size: var(--cui-font-size-sm);
  color: var(--cui-fg);
  background: var(--cui-bg);
}
.cui-actions { display: flex; gap: 6px; margin-top: 6px; }
.cui-actions button {
  border: var(--cui-border-width) solid var(--cui-border);
  background: transparent;
  color: var(--cui-fg);
  border-radius: calc(var(--cui-radius) - 4px);
  padding: 3px 10px;
  cursor: pointer;
  font-size: var(--cui-font-size-sm);
}
.cui-actions button:hover { background: var(--cui-accent-subtle); }
.cui-queue {
  display: none;
  flex: none;
  border-top: var(--cui-border-width) solid var(--cui-border);
  max-height: 140px;
  overflow-y: auto;
}
.cui-queue.visible { display: block; }
.cui-queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: var(--cui-border-width) solid var(--cui-border);
  font-size: calc(var(--cui-font-size-sm) + 1px);
}
.cui-queue-item:last-child { border-bottom: none; }
.cui-queue-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cui-queue-meta { flex: none; color: var(--cui-muted); font-size: calc(var(--cui-font-size-sm) - 1px); }
.cui-queue-item button {
  flex: none;
  border: none;
  background: transparent;
  color: var(--cui-muted);
  cursor: pointer;
  font-size: var(--cui-font-size-sm);
}
.cui-queue-item button:hover { color: var(--cui-fg); }
.cui-quote {
  display: none;
  flex: none;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 12px 0;
  padding: 6px 10px;
  border-left: calc(var(--cui-border-width) + 2px) solid var(--cui-accent);
  background: var(--cui-assistant-bg);
  border-radius: 0 var(--cui-radius) var(--cui-radius) 0;
  font-size: var(--cui-font-size-sm);
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
  border-top: var(--cui-border-width) solid var(--cui-border);
}
.cui-input {
  flex: 1;
  resize: none;
  border: var(--cui-border-width) solid var(--cui-border);
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
.cui-send:disabled, .cui-input:disabled, .cui-attach:disabled { opacity: 0.5; cursor: default; }
@media (prefers-reduced-motion: reduce) {
  .chat-ui *, .chat-ui *::before, .chat-ui *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;
