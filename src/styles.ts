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
.cui-part-tool_call .cui-tool-name { font-weight: 600; }
.cui-part-tool_result { border-left: 2px solid var(--cui-border); padding-left: 8px; margin-top: 4px; white-space: pre-wrap; }
.cui-part-tool_result[data-error='true'] { border-color: var(--cui-error); color: var(--cui-error); }
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
`;
