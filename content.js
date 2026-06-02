let currentPanel = null;
let currentSuggestions = [];
let selectedSuggestionIndex = -1;
let originalText = '';
let currentMode = '';
let savedSelection = null;
let voiceRecognition = null;
let isListening = false;
let translateOpts = null;

document.addEventListener('contextmenu', () => {
  const sel = getSelectedTextInEditable();
  if (sel) savedSelection = sel;
}, true);

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    triggerRewrite();
  }
});

function getSelectedTextInEditable() {
  const activeEl = document.activeElement;
  if (!activeEl) return null;

  if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    if (start === undefined || end === undefined || start === end) return null;
    return { text: activeEl.value.substring(start, end), element: activeEl, start, end };
  }

  if (activeEl.isContentEditable || activeEl.contentEditable === 'true') {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;
    let node = selection.anchorNode;
    while (node && node !== activeEl) node = node.parentNode;
    if (node !== activeEl) {
      const range = selection.getRangeAt(0);
      if (range && activeEl.contains(range.commonAncestorContainer)) {
        return { text: selection.toString(), element: activeEl, range };
      }
      return null;
    }
    return { text: selection.toString(), element: activeEl, range: selection.getRangeAt(0) };
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
  overlay.addEventListener('click', (e) => { if (e.target === overlay) removePanel(); });
  currentPanel = { overlay, panel };
  return panel;
}

function removePanel() {
  stopVoiceRecognition();
  if (currentPanel) {
    if (currentPanel.overlay?.parentNode) {
      currentPanel.overlay.parentNode.removeChild(currentPanel.overlay);
    }
    currentPanel = null;
    currentSuggestions = [];
    selectedSuggestionIndex = -1;
    savedSelection = null;
    translateOpts = null;
  }
}

// === VOICE TO TEXT ===

function initVoiceRecognition(lang) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = lang || 'en-US';
  return rec;
}

function startVoiceRecognition(lang) {
  stopVoiceRecognition();
  voiceRecognition = initVoiceRecognition(lang);
  if (!voiceRecognition) {
    showError('Voice input is not supported in this browser or page context.');
    return;
  }

  let finalText = '';
  voiceRecognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalText += event.results[i][0].transcript + ' ';
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    const transcriptEl = document.getElementById('ai-voice-text');
    if (transcriptEl) {
      transcriptEl.textContent = finalText + interim;
    }
  };

  voiceRecognition.onend = () => {
    isListening = false;
    updateMicButton(false);
    if (finalText.trim() && savedSelection) {
      replaceTextInEditable(savedSelection, finalText.trim());
      savedSelection = null;
      removePanel();
    }
  };

  voiceRecognition.onerror = (event) => {
    isListening = false;
    updateMicButton(false);
    if (event.error !== 'no-speech') {
      showError('Voice error: ' + event.error);
    }
  };

  isListening = true;
  voiceRecognition.start();
}

function stopVoiceRecognition() {
  if (voiceRecognition) {
    try { voiceRecognition.stop(); } catch {}
    voiceRecognition = null;
  }
  isListening = false;
}

function updateMicButton(listening) {
  const btn = document.getElementById('ai-voice-btn');
  if (!btn) return;
  btn.classList.toggle('listening', listening);
  btn.innerHTML = listening
    ? '<span class="ai-mic-pulse"></span>Listening...'
    : 'Start Speaking';
}

// === PANEL UI ===

function showLoading(mode) {
  currentMode = mode;
  const panel = createPanel();

  panel.innerHTML = `
    <div class="ai-rewriter-header">
      <div class="ai-header-left">
        <h3>AI Rewriter</h3>
        <span class="mode-badge">${mode ? escapeHtml(mode) : ''}</span>
      </div>
      <div class="ai-header-right">
        <button class="ai-icon-btn" id="ai-voice-toggle" title="Voice Input">mic</button>
        <button class="ai-icon-btn ai-close-btn" id="ai-rewriter-close">&times;</button>
      </div>
    </div>
    <div class="ai-rewriter-body">
      <div class="ai-loading-state">
        <div class="ai-spinner-ring"></div>
        <p class="ai-loading-text">Generating rewrite suggestions...</p>
        <p class="ai-loading-sub">This may take a few seconds</p>
      </div>
    </div>
  `;

  panel.querySelector('#ai-rewriter-close').addEventListener('click', removePanel);
  panel.querySelector('#ai-voice-toggle').addEventListener('click', () => showVoicePanel());
}

function showError(message) {
  const panel = currentPanel?.panel || createPanel();

  panel.innerHTML = `
    <div class="ai-rewriter-header">
      <div class="ai-header-left"><h3>AI Rewriter</h3></div>
      <button class="ai-icon-btn ai-close-btn" id="ai-rewriter-close">&times;</button>
    </div>
    <div class="ai-rewriter-body">
      <div class="ai-error-state">
        <div class="ai-error-icon">!</div>
        <p class="ai-error-title">Something went wrong</p>
        <p class="ai-error-detail">${escapeHtml(message)}</p>
      </div>
    </div>
    <div class="ai-rewriter-footer">
      <button class="ai-btn ai-btn-secondary" id="ai-retry-btn">Retry</button>
      <button class="ai-btn ai-btn-ghost" id="ai-rewriter-cancel">Close</button>
    </div>
  `;

  panel.querySelector('#ai-rewriter-close').addEventListener('click', removePanel);
  panel.querySelector('#ai-rewriter-cancel').addEventListener('click', removePanel);
  panel.querySelector('#ai-retry-btn').addEventListener('click', () => triggerRewrite());
}

function showSuggestions(suggestions, mode, origText) {
  currentSuggestions = suggestions;
  originalText = origText;
  currentMode = mode;
  selectedSuggestionIndex = 0;

  const panel = currentPanel?.panel || createPanel();
  const modeName = mode || '';

  panel.innerHTML = `
    <div class="ai-rewriter-header">
      <div class="ai-header-left">
        <h3>AI Rewriter</h3>
        <span class="mode-badge">${escapeHtml(modeName)}</span>
      </div>
      <div class="ai-header-right">
        <button class="ai-icon-btn" id="ai-mode-switch" title="Change Mode">swap</button>
        <button class="ai-icon-btn" id="ai-voice-toggle" title="Voice Input">mic</button>
        <button class="ai-icon-btn ai-close-btn" id="ai-rewriter-close">&times;</button>
      </div>
    </div>
    <div class="ai-rewriter-body">
      <div class="ai-diff-view">
        <div class="ai-diff-pane ai-diff-original">
          <div class="ai-diff-label">Original</div>
          <div class="ai-diff-content">${escapeHtml(origText)}</div>
        </div>
        <div class="ai-diff-divider"></div>
        <div class="ai-diff-pane ai-diff-rewritten">
          <div class="ai-diff-label">Rewritten</div>
          <div class="ai-diff-content">${escapeHtml(suggestions[0])}</div>
        </div>
      </div>
      <div class="ai-suggestions-list" id="ai-suggestions-list">
        ${suggestions.map((s, i) => `
          <div class="ai-suggestion-card ${i === 0 ? 'selected' : ''}" data-index="${i}">
            <div class="ai-card-header">
              <span class="ai-card-version">Version ${i + 1}</span>
              <div class="ai-card-actions">
                <button class="ai-card-btn" data-index="${i}" data-action="copy" title="Copy">Copy</button>
                <button class="ai-card-btn" data-index="${i}" data-action="preview" title="Preview in diff">Preview</button>
              </div>
            </div>
            <div class="ai-card-text">${escapeHtml(s.substring(0, 200))}${s.length > 200 ? '...' : ''}</div>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="ai-rewriter-footer">
      <button class="ai-btn ai-btn-primary" id="ai-rewriter-replace">Replace Selected Text</button>
      <button class="ai-btn ai-btn-secondary" id="ai-rewriter-regenerate">Regenerate</button>
      <button class="ai-btn ai-btn-ghost" id="ai-rewriter-cancel">Cancel</button>
    </div>
  `;

  panel.querySelector('#ai-rewriter-close').addEventListener('click', removePanel);
  panel.querySelector('#ai-rewriter-cancel').addEventListener('click', removePanel);
  panel.querySelector('#ai-rewriter-replace').addEventListener('click', handleReplace);
  panel.querySelector('#ai-rewriter-regenerate').addEventListener('click', handleRegenerate);
  panel.querySelector('#ai-voice-toggle').addEventListener('click', () => showVoicePanel());
  panel.querySelector('#ai-mode-switch').addEventListener('click', showModeSwitcher);

  const list = panel.querySelector('#ai-suggestions-list');
  list.addEventListener('click', (e) => {
    const cardEl = e.target.closest('.ai-suggestion-card');
    if (!cardEl) return;
    const index = parseInt(cardEl.dataset.index, 10);

    if (e.target.dataset.action === 'copy') {
      e.stopPropagation();
      copyToClipboard(currentSuggestions[index]).then(() => {
        e.target.textContent = 'Copied!';
        setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
      }).catch(() => {
        e.target.textContent = 'Failed';
        setTimeout(() => { e.target.textContent = 'Copy'; }, 1500);
      });
      return;
    }

    if (e.target.dataset.action === 'preview') {
      e.stopPropagation();
      selectSuggestion(index);
      const diffContent = panel.querySelector('.ai-diff-rewritten .ai-diff-content');
      if (diffContent) diffContent.textContent = currentSuggestions[index];
      return;
    }

    selectSuggestion(index);
    const diffContent = panel.querySelector('.ai-diff-rewritten .ai-diff-content');
    if (diffContent) diffContent.textContent = currentSuggestions[index];
  });

  updateReplaceButton();
}

function showVoicePanel() {
  if (!currentPanel) return;
  const panel = currentPanel.panel;

  panel.innerHTML = `
    <div class="ai-rewriter-header">
      <div class="ai-header-left"><h3>Voice Input</h3></div>
      <button class="ai-icon-btn ai-close-btn" id="ai-voice-close">&times;</button>
    </div>
    <div class="ai-rewriter-body">
      <div class="ai-voice-container">
        <div class="ai-mic-icon">mic</div>
        <p class="ai-voice-label">Speak your text</p>
        <div class="ai-voice-lang-select">
          <label>Language:</label>
          <select id="ai-voice-lang">
            ${VOICE_LANGS.map(l => `<option value="${l.code}">${l.name}</option>`).join('')}
          </select>
        </div>
        <div class="ai-voice-transcript" id="ai-voice-text">Tap the button and start speaking...</div>
        <button class="ai-btn ai-btn-primary ai-mic-btn" id="ai-voice-btn">Start Speaking</button>
      </div>
    </div>
    <div class="ai-rewriter-footer">
      <button class="ai-btn ai-btn-ghost" id="ai-voice-cancel">Close</button>
    </div>
  `;

  panel.querySelector('#ai-voice-close').addEventListener('click', removePanel);
  panel.querySelector('#ai-voice-cancel').addEventListener('click', () => {
    stopVoiceRecognition();
    if (originalText) showSuggestions(currentSuggestions, currentMode, originalText);
    else removePanel();
  });
  panel.querySelector('#ai-voice-btn').addEventListener('click', () => {
    const lang = panel.querySelector('#ai-voice-lang')?.value || 'en-US';
    if (isListening) {
      stopVoiceRecognition();
    } else {
      startVoiceRecognition(lang);
      updateMicButton(true);
    }
  });
}

function showModeSwitcher() {
  if (!currentPanel) return;
  const panel = currentPanel.panel;

  const modes = [
    { id: 'improve-grammar', name: 'Improve Grammar' },
    { id: 'professional-tone', name: 'Professional Tone' },
    { id: 'friendly-tone', name: 'Friendly Tone' },
    { id: 'concise', name: 'Concise Version' },
    { id: 'expand', name: 'Expand Content' },
    { id: 'simplify', name: 'Simplify Content' },
    { id: 'business-communication', name: 'Business Communication' },
    { id: 'email-style', name: 'Email Style' },
    { id: 'translate', name: 'Translate' },
    { id: 'custom', name: 'Custom Prompt' }
  ];

  panel.innerHTML = `
    <div class="ai-rewriter-header">
      <div class="ai-header-left"><h3>Change Rewrite Mode</h3></div>
      <button class="ai-icon-btn ai-close-btn" id="ai-mode-close">&times;</button>
    </div>
    <div class="ai-rewriter-body">
      <div class="ai-mode-grid">
        ${modes.map(m => `
          <button class="ai-mode-chip ${currentMode === m.name ? 'active' : ''}" data-mode="${m.id}">
            ${m.name}
          </button>
        `).join('')}
      </div>
    </div>
    <div class="ai-rewriter-footer">
      <button class="ai-btn ai-btn-ghost" id="ai-mode-cancel">Back</button>
    </div>
  `;

  panel.querySelector('#ai-mode-close').addEventListener('click', () => {
    showSuggestions(currentSuggestions, currentMode, originalText);
  });
  panel.querySelector('#ai-mode-cancel').addEventListener('click', () => {
    showSuggestions(currentSuggestions, currentMode, originalText);
  });

  panel.querySelectorAll('.ai-mode-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const mode = chip.dataset.mode;
      if (mode === 'translate') {
        showTranslatePanel();
      } else {
        currentMode = REWRITE_MODE_NAMES[mode] || mode;
        handleRegenerate();
      }
    });
  });
}

function showTranslatePanel() {
  if (!currentPanel) return;
  const panel = currentPanel.panel;

  panel.innerHTML = `
    <div class="ai-rewriter-header">
      <div class="ai-header-left"><h3>Translate</h3></div>
      <button class="ai-icon-btn ai-close-btn" id="ai-translate-close">&times;</button>
    </div>
    <div class="ai-rewriter-body">
      <div class="ai-translate-container">
        <div class="ai-translate-row">
          <div class="ai-translate-field">
            <label>From</label>
            <select id="ai-translate-source">
              ${buildLangOptions()}
            </select>
          </div>
          <div class="ai-translate-swap" id="ai-translate-swap" title="Swap languages">swap</div>
          <div class="ai-translate-field">
            <label>To</label>
            <select id="ai-translate-target">
              ${buildLangOptions(false)}
            </select>
          </div>
        </div>
        <div class="ai-translate-original">
          <div class="ai-translate-label">Original Text</div>
          <div class="ai-translate-text">${escapeHtml(originalText)}</div>
        </div>
      </div>
    </div>
    <div class="ai-rewriter-footer">
      <button class="ai-btn ai-btn-primary" id="ai-translate-go">Translate</button>
      <button class="ai-btn ai-btn-ghost" id="ai-translate-cancel">Back</button>
    </div>
  `;

  panel.querySelector('#ai-translate-close').addEventListener('click', removePanel);
  panel.querySelector('#ai-translate-cancel').addEventListener('click', () => {
    showSuggestions(currentSuggestions, currentMode, originalText);
  });

  panel.querySelector('#ai-translate-swap').addEventListener('click', () => {
    const src = panel.querySelector('#ai-translate-source');
    const tgt = panel.querySelector('#ai-translate-target');
    if (src.value !== 'auto') {
      const tmp = src.value;
      src.value = tgt.value;
      tgt.value = tmp;
    }
  });

  panel.querySelector('#ai-translate-go').addEventListener('click', async () => {
    const source = panel.querySelector('#ai-translate-source').value;
    const target = panel.querySelector('#ai-translate-target').value;

    translateOpts = { source, target };
    const btn = panel.querySelector('#ai-translate-go');
    btn.disabled = true;
    btn.textContent = 'Translating...';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'translateText',
        text: originalText,
        translateOpts
      });

      if (response.success) {
        currentMode = 'Translate';
        showSuggestions([response.text], 'Translate', originalText);
      } else {
        showError(response.error || 'Translation failed');
      }
    } catch (error) {
      showError(error.message || 'Translation failed');
    }
  });
}

const LANGUAGES = {
  'auto': 'Auto Detect', 'af': 'Afrikaans', 'ar': 'Arabic', 'bg': 'Bulgarian',
  'bn': 'Bengali', 'ca': 'Catalan', 'cs': 'Czech', 'cy': 'Welsh', 'da': 'Danish',
  'de': 'German', 'el': 'Greek', 'en': 'English', 'es': 'Spanish',
  'et': 'Estonian', 'fa': 'Persian', 'fi': 'Finnish', 'fr': 'French',
  'gu': 'Gujarati', 'he': 'Hebrew', 'hi': 'Hindi', 'hr': 'Croatian',
  'hu': 'Hungarian', 'id': 'Indonesian', 'is': 'Icelandic', 'it': 'Italian',
  'ja': 'Japanese', 'kn': 'Kannada', 'ko': 'Korean', 'lt': 'Lithuanian',
  'lv': 'Latvian', 'mk': 'Macedonian', 'ml': 'Malayalam', 'mr': 'Marathi',
  'ms': 'Malay', 'nl': 'Dutch', 'no': 'Norwegian', 'pa': 'Punjabi',
  'pl': 'Polish', 'pt': 'Portuguese', 'ro': 'Romanian', 'ru': 'Russian',
  'sk': 'Slovak', 'sl': 'Slovenian', 'sq': 'Albanian', 'sr': 'Serbian',
  'sv': 'Swedish', 'sw': 'Swahili', 'ta': 'Tamil', 'te': 'Telugu',
  'th': 'Thai', 'tr': 'Turkish', 'uk': 'Ukrainian', 'ur': 'Urdu',
  'vi': 'Vietnamese', 'zh-CN': 'Chinese (Simplified)', 'zh-TW': 'Chinese (Traditional)'
};

const VOICE_LANGS = [
  { code: 'en-US', name: 'English (US)' }, { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish' }, { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' }, { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese' }, { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' }, { code: 'zh-CN', name: 'Chinese' },
  { code: 'hi-IN', name: 'Hindi' }, { code: 'ar-SA', name: 'Arabic' }
];

const REWRITE_MODE_NAMES = {
  'improve-grammar': 'Improve Grammar', 'professional-tone': 'Professional Tone',
  'friendly-tone': 'Friendly Tone', 'concise': 'Concise Version',
  'expand': 'Expand Content', 'simplify': 'Simplify Content',
  'business-communication': 'Business Communication', 'email-style': 'Email Style',
  'translate': 'Translate', 'custom': 'Custom Prompt'
};

function buildLangOptions(includeAuto = true) {
  let html = '';
  if (includeAuto) html += '<option value="auto">Auto Detect</option>';
  for (const [code, name] of Object.entries(LANGUAGES)) {
    if (code === 'auto' && !includeAuto) continue;
    const sel = (!includeAuto && code === 'en') ? ' selected' : '';
    html += `<option value="${code}"${sel}>${name}</option>`;
  }
  return html;
}

function selectSuggestion(index) {
  selectedSuggestionIndex = index;
  document.querySelectorAll('.ai-suggestion-card').forEach(el => el.classList.remove('selected'));
  const selected = document.querySelector(`.ai-suggestion-card[data-index="${index}"]`);
  if (selected) selected.classList.add('selected');
  updateReplaceButton();
}

function updateReplaceButton() {
  const btn = document.getElementById('ai-rewriter-replace');
  if (btn) btn.disabled = selectedSuggestionIndex < 0 || selectedSuggestionIndex >= currentSuggestions.length;
}

function handleReplace() {
  if (selectedSuggestionIndex < 0 || selectedSuggestionIndex >= currentSuggestions.length) return;
  const newText = currentSuggestions[selectedSuggestionIndex];

  addToHistory(originalText, newText, currentMode);

  if (savedSelection) {
    replaceTextInEditable(savedSelection, newText);
  }
  removePanel();
}

async function handleRegenerate() {
  const panel = currentPanel?.panel;
  if (!panel) return;

  const regenBtn = panel.querySelector('#ai-rewriter-regenerate');
  if (regenBtn) regenBtn.disabled = true;

  panel.querySelector('.ai-rewriter-body').innerHTML = `
    <div class="ai-loading-state">
      <div class="ai-spinner-ring"></div>
      <p class="ai-loading-text">Regenerating...</p>
    </div>
  `;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'regenerateAI',
      originalText,
      mode: Object.entries(REWRITE_MODE_NAMES).find(([, v]) => v === currentMode)?.[0] || 'improve-grammar',
      translateOpts
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

async function triggerRewrite() {
  const sel = getSelectedTextInEditable() || savedSelection;
  if (!sel?.text) return;

  savedSelection = sel;
  originalText = sel.text;
  currentMode = 'Improve Grammar';

  showLoading(currentMode);

  try {
    const settings = await getSettingsFromStorage();
    if (!settings.apiKey) {
      showError('API key not configured. Open extension Options to set it up.');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      action: 'callAI',
      settings,
      prompt: `Correct grammar, spelling, and punctuation errors in the following text. Return only the corrected version.\n\n${sel.text}`
    });

    if (response.success) {
      addToHistory(sel.text, response.text, currentMode);
      showSuggestions([response.text], currentMode, sel.text);
    } else {
      showError(response.error || 'AI request failed');
    }
  } catch (error) {
    showError(error.message || 'AI request failed');
  }
}

async function getSettingsFromStorage() {
  const result = await chrome.storage.local.get('settings');
  const defaults = { provider: 'openai', apiKey: '', model: 'gpt-4o', temperature: 0.7, maxTokens: 2048 };
  return { ...defaults, ...(result.settings || {}) };
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch {}
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

async function addToHistory(original, rewritten, mode) {
  try {
    await chrome.runtime.sendMessage({
      action: 'addHistory',
      entry: { original, rewritten, mode }
    });
  } catch {}
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// === MESSAGE HANDLERS ===

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSelectedText') {
    const sel = getSelectedTextInEditable() || savedSelection;
    sendResponse({ text: sel?.text || '' });
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
    if (!sel?.text) {
      showError('No text selected. Please select text in an editable field.');
      sendResponse({ error: 'No text selected' });
      return true;
    }

    originalText = sel.text;
    currentMode = message.mode;

    chrome.runtime.sendMessage({
      action: 'callAI', settings: message.settings, prompt: message.prompt
    }).then(response => {
      if (response.success) {
        addToHistory(message.originalText, response.text, message.mode);
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
    addToHistory(message.originalText, message.suggestions[0], message.mode);
    showSuggestions(message.suggestions, message.mode, message.originalText);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'startVoiceInput') {
    showVoicePanel();
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'startTranslate') {
    const sel = getSelectedTextInEditable() || savedSelection;
    if (sel) {
      savedSelection = sel;
      originalText = sel.text;
    }
    showLoading('Translate');
    showTranslatePanel();
    sendResponse({ success: true });
    return false;
  }
});
