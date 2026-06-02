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
  { id: 'custom', label: 'Custom Prompt' }
];

chrome.runtime.onInstalled.addListener(() => {
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
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  const menuItemId = info.menuItemId;
  if (!menuItemId || !info.editable) return;

  let mode = 'improve-grammar';
  if (menuItemId !== MENU_ID) {
    mode = menuItemId.toString().replace(`${MENU_ID}-`, '');
  }

  try {
    const settings = await getSettings();
    if (!settings.apiKey) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showError',
        message: 'API key not configured. Please open the extension settings (right-click extension icon > Options) to configure your AI provider.'
      });
      return;
    }

    chrome.tabs.sendMessage(tab.id, {
      action: 'showLoading',
      mode: getPromptName(mode)
    });

    const selResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getSelectedText' });

    if (!selResponse || !selResponse.text || !selResponse.text.trim()) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showError',
        message: 'No text selected. Please select text in an editable field and try again.'
      });
      return;
    }

    const selectedText = selResponse.text.trim();
    const prompt = getPromptForMode(mode, selectedText, settings.customModePrompt);

    try {
      const result = await callAIProvider(settings, prompt);
      chrome.tabs.sendMessage(tab.id, {
        action: 'showSuggestions',
        suggestions: [result],
        mode: getPromptName(mode),
        originalText: selectedText
      });
    } catch (error) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showError',
        message: error.message || 'AI request failed'
      });
    }

  } catch (error) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'showError',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'callAI') {
    callAIProvider(message.settings, message.prompt)
      .then(result => sendResponse({ success: true, text: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'regenerateAI') {
    getSettings().then(settings => {
      const prompt = getPromptForMode(message.mode, message.originalText, settings.customModePrompt);
      return callAIProvider(settings, prompt).then(result => {
        sendResponse({ success: true, suggestions: [result] });
      });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (message.action === 'testConnection') {
    testConnection(message.settings)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
