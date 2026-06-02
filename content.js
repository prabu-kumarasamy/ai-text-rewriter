let currentPanel = null;
let currentSuggestions = [];
let selectedSuggestionIndex = -1;
let originalText = '';
let currentMode = '';
let savedSelection = null;

document.addEventListener('contextmenu', () => {
  const sel = getSelectedTextInEditable();
  if (sel) {
    savedSelection = sel;
  }
}, true);

function getSelectedTextInEditable() {
  const activeEl = document.activeElement;

  if (!activeEl) return null;

  if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    if (start === undefined || end === undefined || start === end) return null;
    return {
      text: activeEl.value.substring(start, end),
      element: activeEl,
      start: start,
      end: end
    };
  }

  if (activeEl.isContentEditable || activeEl.contentEditable === 'true') {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;

    let node = selection.anchorNode;
    while (node && node !== activeEl) {
      node = node.parentNode;
    }
    if (node !== activeEl) {
      const range = selection.getRangeAt(0);
      if (range && activeEl.contains(range.commonAncestorContainer)) {
        return {
          text: selection.toString(),
          element: activeEl,
          range: range
        };
      }
      return null;
    }

    return {
      text: selection.toString(),
      element: activeEl,
      range: selection.getRangeAt(0)
    };
  }

  return null;
}

function replaceTextInEditable(sel, newText) {
  if (!sel) return false;

  const el = sel.element;

  if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && sel.start !== undefined) {
    el.focus();
    el.setRangeText(newText, sel.start, sel.end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (el.isContentEditable || el.contentEditable === 'true') {
    el.focus();
    const selection = window.getSelection();
    if (selection && sel.range) {
      selection.removeAllRanges();
      selection.addRange(sel.range);
      document.execCommand('insertText', false, newText);
      return true;
    }
  }

  return false;
}

function createPanel() {
  removePanel();

  const overlay = document.createElement('div');
  overlay.className = 'ai-rewriter-overlay';
  overlay.id = 'ai-rewriter-overlay';

  const panel = document.createElement('div');
  panel.className = 'ai-rewriter-panel';
  panel.id = 'ai-rewriter-panel';

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      removePanel();
    }
  });

  currentPanel = { overlay, panel };
  return panel;
}

function removePanel() {
  if (currentPanel) {
    if (currentPanel.overlay && currentPanel.overlay.parentNode) {
      currentPanel.overlay.parentNode.removeChild(currentPanel.overlay);
    }
    currentPanel = null;
    currentSuggestions = [];
    selectedSuggestionIndex = -1;
    savedSelection = null;
  }
}

function showLoading(mode) {
  currentMode = mode;
  const panel = createPanel();

  panel.innerHTML = `
    <div class="ai-rewriter-header">
      <h3>AI Rewriter</h3>
      <span class="mode-badge">${mode ? mode.replace(/-/g, ' ') : ''}</span>
      <button class="ai-rewriter-close" id="ai-rewriter-close">&times;</button>
    </div>
    <div class="ai-rewriter-body">
      <div class="ai-rewriter-loading">
        <div class="ai-rewriter-spinner"></div>
        <p>Generating rewrite suggestions...</p>
      </div>
    </div>
  `;

  panel.querySelector('#ai-rewriter-close').addEventListener('click', removePanel);
}

function showError(message) {
  const panel = currentPanel ? currentPanel.panel : createPanel();

  panel.innerHTML = `
    <div class="ai-rewriter-header">
      <h3>AI Rewriter</h3>
      <button class="ai-rewriter-close" id="ai-rewriter-close">&times;</button>
    </div>
    <div class="ai-rewriter-body">
      <div class="ai-rewriter-error">
        <div class="ai-rewriter-error-title">Error</div>
        <div>${escapeHtml(message)}</div>
      </div>
    </div>
    <div class="ai-rewriter-footer">
      <button class="ai-rewriter-btn ai-rewriter-btn-secondary" id="ai-rewriter-cancel">Close</button>
    </div>
  `;

  panel.querySelector('#ai-rewriter-close').addEventListener('click', removePanel);
  panel.querySelector('#ai-rewriter-cancel').addEventListener('click', removePanel);
}

function showSuggestions(suggestions, mode, origText) {
  currentSuggestions = suggestions;
  originalText = origText;
  currentMode = mode;
  selectedSuggestionIndex = 0;

  const panel = currentPanel ? currentPanel.panel : createPanel();
  const modeName = mode ? mode.replace(/-/g, ' ') : '';

  panel.innerHTML = `
    <div class="ai-rewriter-header">
      <h3>AI Rewriter</h3>
      <span class="mode-badge">${escapeHtml(modeName)}</span>
      <button class="ai-rewriter-close" id="ai-rewriter-close">&times;</button>
    </div>
    <div class="ai-rewriter-body">
      <div class="ai-rewriter-original">
        <div class="ai-rewriter-original-label">Original Text</div>
        <div>${escapeHtml(origText)}</div>
      </div>
      <ul class="ai-rewriter-suggestions" id="ai-rewriter-suggestions">
        ${suggestions.map((s, i) => `
          <li class="ai-rewriter-suggestion ${i === 0 ? 'selected' : ''}" data-index="${i}">
            <div class="ai-rewriter-suggestion-header">
              <span class="ai-rewriter-suggestion-number">Version ${i + 1}</span>
              <button class="ai-rewriter-suggestion-copy" data-index="${i}" data-action="copy" title="Copy">Copy</button>
            </div>
            <div class="ai-rewriter-suggestion-text">${escapeHtml(s)}</div>
          </li>
        `).join('')}
      </ul>
    </div>
    <div class="ai-rewriter-footer">
      <button class="ai-rewriter-btn ai-rewriter-btn-primary" id="ai-rewriter-replace" disabled>Replace Selected Text</button>
      <button class="ai-rewriter-btn ai-rewriter-btn-secondary" id="ai-rewriter-regenerate">Regenerate</button>
      <button class="ai-rewriter-btn ai-rewriter-btn-danger" id="ai-rewriter-cancel">Cancel</button>
    </div>
  `;

  panel.querySelector('#ai-rewriter-close').addEventListener('click', removePanel);
  panel.querySelector('#ai-rewriter-cancel').addEventListener('click', removePanel);
  panel.querySelector('#ai-rewriter-replace').addEventListener('click', handleReplace);
  panel.querySelector('#ai-rewriter-regenerate').addEventListener('click', handleRegenerate);

  const suggestionsList = panel.querySelector('#ai-rewriter-suggestions');
  suggestionsList.addEventListener('click', (e) => {
    const suggestionEl = e.target.closest('.ai-rewriter-suggestion');
    if (!suggestionEl) return;

    const index = parseInt(suggestionEl.dataset.index, 10);

    if (e.target.dataset.action === 'copy') {
      e.stopPropagation();
      copyToClipboard(currentSuggestions[index]).then(() => {
        const btn = e.target;
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      }).catch(() => {
        const btn = e.target;
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
      return;
    }

    selectSuggestion(index);
  });

  updateReplaceButton();
}

function selectSuggestion(index) {
  selectedSuggestionIndex = index;
  const allSuggestions = document.querySelectorAll('.ai-rewriter-suggestion');
  allSuggestions.forEach(el => el.classList.remove('selected'));
  const selected = document.querySelector(`.ai-rewriter-suggestion[data-index="${index}"]`);
  if (selected) {
    selected.classList.add('selected');
  }
  updateReplaceButton();
}

function updateReplaceButton() {
  const btn = document.getElementById('ai-rewriter-replace');
  if (btn) {
    btn.disabled = selectedSuggestionIndex < 0 || selectedSuggestionIndex >= currentSuggestions.length;
  }
}

function handleReplace() {
  if (selectedSuggestionIndex < 0 || selectedSuggestionIndex >= currentSuggestions.length) return;

  const newText = currentSuggestions[selectedSuggestionIndex];

  if (savedSelection) {
    replaceTextInEditable(savedSelection, newText);
  }

  removePanel();
}

async function handleRegenerate() {
  const panel = currentPanel ? currentPanel.panel : null;
  if (!panel) return;

  const regenerateBtn = panel.querySelector('#ai-rewriter-regenerate');
  if (regenerateBtn) regenerateBtn.disabled = true;

  panel.querySelector('.ai-rewriter-body').innerHTML = `
    <div class="ai-rewriter-original">
      <div class="ai-rewriter-original-label">Original Text</div>
      <div>${escapeHtml(originalText)}</div>
    </div>
    <div class="ai-rewriter-loading">
      <div class="ai-rewriter-spinner"></div>
      <p>Generating new suggestions...</p>
    </div>
  `;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'regenerateAI',
      originalText: originalText,
      mode: currentMode
    });

    if (response.success) {
      showSuggestions(response.suggestions, currentMode, originalText);
    } else {
      showError(response.error || 'Failed to generate suggestions');
    }
  } catch (error) {
    showError(error.message || 'Failed to generate suggestions');
  }
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSelectedText') {
    const sel = getSelectedTextInEditable() || savedSelection;
    sendResponse({ text: sel ? sel.text : '' });
    return true;
  }

  if (message.action === 'showLoading') {
    showLoading(message.mode);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'showError') {
    showError(message.message);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'processRewrite') {
    const sel = getSelectedTextInEditable() || savedSelection;
    if (!sel || !sel.text) {
      showError('No text selected. Please select text in an editable field.');
      sendResponse({ error: 'No text selected' });
      return true;
    }

    originalText = sel.text;
    currentMode = message.mode;

    chrome.runtime.sendMessage({
      action: 'callAI',
      settings: message.settings,
      prompt: message.prompt
    }).then(response => {
      if (response.success) {
        showSuggestions([response.text], message.mode, message.originalText);
        sendResponse({ success: true });
      } else {
        showError(response.error || 'AI request failed');
        sendResponse({ error: response.error });
      }
    }).catch(error => {
      showError(error.message || 'AI request failed');
      sendResponse({ error: error.message });
    });

    return true;
  }

  if (message.action === 'showSuggestions') {
    showSuggestions(message.suggestions, message.mode, message.originalText);
    sendResponse({ success: true });
    return false;
  }
});
