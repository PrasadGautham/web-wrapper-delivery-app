import { escapeHtml } from './formatting.js';

export function renderEmpty(target, message) {
  target.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}
