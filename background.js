importScripts('utils/storage.js', 'utils/providers.js');

const MENU_ID = 'ai-rewriter';
const MODES = [
  { id: 'improve-grammar', label: 'Improve Grammar' },
  { id: 'professional-tone', label: 'Professional Tone' },
  { id: 'friendly-tone', label: 'Friendly Tone' },
  { id: 'concise', label: 'Concise Version' },
  { id: 'expand', label: 'Expand Content' },
  { id: 'simplify', label: 'Simplify Content' },
  { id: 'business-communication', label: 'Business Communication' },
  { id: 'email-style', label: 'Email Style' },
  { id: 'translate', label: 'Translate' },
  { id: 'custom', label: 'Custom Prompt' }
];

function safeSendMessage(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Rewrite with AI',
      contexts: ['editable']
    });
    MODES.forEach(mode => {
      chrome.contextMenus.create({
        id: `${MENU_ID}-${mode.id}`,
        parentId: MENU_ID,
        title: mode.label,
        contexts: ['editable']
      });
    });
    chrome.contextMenus.create({
      id: `${MENU_ID}-separator`,
      parentId: MENU_ID,
      type: 'separator',
      contexts: ['editable']
    });
    chrome.contextMenus.create({
      id: `${MENU_ID}-voice`,
      parentId: MENU_ID,
      title: 'Voice Input',
      contexts: ['editable']
    });
  });
});

async function handleRewrite(tabId, mode, translateOpts) {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      safeSendMessage(tabId, {
        action: 'showError',
        message: 'API key not configured. Open extension Options to set it up.'
      });
      return;
    }

    safeSendMessage(tabId, { action: 'showLoading', mode: getPromptName(mode) });

    const selResponse = await chrome.tabs.sendMessage(tabId, { action: 'getSelectedText' });
    if (!selResponse || !selResponse.text || !selResponse.text.trim()) {
      safeSendMessage(tabId, {
        action: 'showError',
        message: 'No text selected. Select text in an editable field first.'
      });
      return;
    }

    const selectedText = selResponse.text.trim();
    const prompt = getPromptForMode(mode, selectedText, settings.customModePrompt, translateOpts);
    const result = await callAIProvider(settings, prompt);

    safeSendMessage(tabId, {
      action: 'showSuggestions',
      suggestions: [result],
      mode: getPromptName(mode),
      originalText: selectedText
    });
  } catch (error) {
    safeSendMessage(tabId, {
      action: 'showError',
      message: error.message || 'An unexpected error occurred'
    });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  const menuItemId = info.menuItemId;
  if (!menuItemId || !info.editable) return;

  if (menuItemId === `${MENU_ID}-voice`) {
    safeSendMessage(tab.id, { action: 'startVoiceInput' });
    return;
  }

  let mode = 'improve-grammar';
  if (menuItemId !== MENU_ID && menuItemId !== `${MENU_ID}-separator`) {
    mode = menuItemId.toString().replace(`${MENU_ID}-`, '');
  }

  if (mode === 'translate') {
    safeSendMessage(tab.id, { action: 'startTranslate' });
    return;
  }

  await handleRewrite(tab.id, mode);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'callAI') {
    callAIProvider(message.settings, message.prompt)
      .then(result => sendResponse({ success: true, text: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'translateText') {
    getSettings().then(settings => {
      const prompt = getPromptForMode('translate', message.text, settings.customModePrompt, message.translateOpts);
      return callAIProvider(settings, prompt).then(result => {
        sendResponse({ success: true, text: result });
      });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'regenerateAI') {
    getSettings().then(settings => {
      const prompt = getPromptForMode(message.mode, message.originalText, settings.customModePrompt, message.translateOpts);
      return callAIProvider(settings, prompt).then(result => {
        sendResponse({ success: true, suggestions: [result] });
      });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'addHistory') {
    addToHistory(message.entry)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'testConnection') {
    testConnection(message.settings)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
