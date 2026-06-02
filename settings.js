const provEl = document.getElementById('provider');
const keyEl = document.getElementById('apiKey');
const modelEl = document.getElementById('model');
const tempEl = document.getElementById('temperature');
const tempValEl = document.getElementById('temperature-value');
const maxTokensEl = document.getElementById('maxTokens');
const defaultModeEl = document.getElementById('defaultMode');
const customModePromptEl = document.getElementById('customModePrompt');
const customPromptTemplateEl = document.getElementById('customPromptTemplate');
const customEndpointEl = document.getElementById('customEndpoint');
const customEndpointGroup = document.getElementById('custom-endpoint-group');
const customModeGroup = document.getElementById('custom-mode-group');
const testBtn = document.getElementById('testConnection');
const testResultEl = document.getElementById('test-result');
const saveBtn = document.getElementById('saveSettings');
const saveStatusEl = document.getElementById('save-status');
const exportBtn = document.getElementById('exportSettings');
const importBtn = document.getElementById('importSettings');
const importFileEl = document.getElementById('importFile');
const toggleKeyBtn = document.getElementById('toggleApiKey');
const modelHintEl = document.getElementById('model-hint');

const MODEL_HINTS = {
  openai: 'e.g. gpt-4o, gpt-4-turbo, gpt-3.5-turbo',
  anthropic: 'e.g. claude-sonnet-4-20250514, claude-3-5-sonnet-latest',
  gemini: 'e.g. gemini-2.0-flash, gemini-1.5-pro',
  deepseek: 'e.g. deepseek-chat, deepseek-reasoner',
  custom: 'Specify your model name'
};

const DEFAULT_MODELS = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.0-flash',
  deepseek: 'deepseek-chat',
  custom: ''
};

async function loadSettings() {
  const result = await chrome.storage.local.get('settings');
  const defaults = {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 2048,
    customEndpoint: '',
    customPromptTemplate: '',
    rewriteMode: 'improve-grammar',
    customModePrompt: ''
  };

  const settings = result.settings ? { ...defaults, ...result.settings } : defaults;

  provEl.value = settings.provider;
  keyEl.value = settings.apiKey;
  modelEl.value = settings.model;
  tempEl.value = settings.temperature;
  tempValEl.textContent = settings.temperature;
  maxTokensEl.value = settings.maxTokens;
  defaultModeEl.value = settings.rewriteMode;
  customModePromptEl.value = settings.customModePrompt || '';
  customPromptTemplateEl.value = settings.customPromptTemplate || '';
  customEndpointEl.value = settings.customEndpoint || '';

  updateProviderUI(settings.provider);
  updateModeUI(settings.rewriteMode);
}

function updateProviderUI(provider) {
  customEndpointGroup.style.display = provider === 'custom' ? 'block' : 'none';
  modelHintEl.textContent = MODEL_HINTS[provider] || '';

  if (!modelEl.value.trim() || modelEl.value === DEFAULT_MODELS[provEl.previousValue]) {
    modelEl.value = DEFAULT_MODELS[provider] || '';
  }
  provEl.previousValue = provider;

  if (provider === 'gemini') {
    modelEl.placeholder = 'gemini-2.0-flash';
  } else if (provider === 'anthropic') {
    modelEl.placeholder = 'claude-sonnet-4-20250514';
  } else if (provider === 'deepseek') {
    modelEl.placeholder = 'deepseek-chat';
  } else if (provider === 'custom') {
    modelEl.placeholder = 'Enter model name';
  } else {
    modelEl.placeholder = 'gpt-4o';
  }
}

function updateModeUI(mode) {
  customModeGroup.style.display = mode === 'custom' ? 'block' : 'none';
}

function collectSettings() {
  return {
    provider: provEl.value,
    apiKey: keyEl.value,
    model: modelEl.value,
    temperature: parseFloat(tempEl.value) || 0.7,
    maxTokens: parseInt(maxTokensEl.value, 10) || 2048,
    customEndpoint: customEndpointEl.value,
    customPromptTemplate: customPromptTemplateEl.value,
    rewriteMode: defaultModeEl.value,
    customModePrompt: customModePromptEl.value
  };
}

async function saveSettingsToStorage() {
  const settings = collectSettings();
  await chrome.storage.local.set({ settings });
}

provEl.addEventListener('change', () => {
  updateProviderUI(provEl.value);
});

defaultModeEl.addEventListener('change', () => {
  updateModeUI(defaultModeEl.value);
});

tempEl.addEventListener('input', () => {
  tempValEl.textContent = parseFloat(tempEl.value).toFixed(1);
});

toggleKeyBtn.addEventListener('click', () => {
  const isPassword = keyEl.type === 'password';
  keyEl.type = isPassword ? 'text' : 'password';
  toggleKeyBtn.textContent = isPassword ? 'Hide' : 'Show';
});

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveStatusEl.textContent = '';
  saveStatusEl.className = 'save-status';

  try {
    await saveSettingsToStorage();
    saveStatusEl.textContent = 'Settings saved successfully';
    saveStatusEl.className = 'save-status success';
  } catch (error) {
    saveStatusEl.textContent = 'Failed to save settings: ' + error.message;
    saveStatusEl.className = 'save-status error';
  } finally {
    saveBtn.disabled = false;
    setTimeout(() => {
      saveStatusEl.textContent = '';
      saveStatusEl.className = 'save-status';
    }, 3000);
  }
});

testBtn.addEventListener('click', async () => {
  testBtn.disabled = true;
  testResultEl.textContent = 'Testing connection...';
  testResultEl.className = 'test-result loading';

  const settings = collectSettings();
  if (!settings.apiKey) {
    testResultEl.textContent = 'Please enter an API key first';
    testResultEl.className = 'test-result error';
    testBtn.disabled = false;
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'testConnection',
      settings: settings
    });

    if (response.success) {
      testResultEl.textContent = 'Connection successful';
      testResultEl.className = 'test-result success';
    } else {
      testResultEl.textContent = 'Connection failed: ' + (response.error || 'Unknown error');
      testResultEl.className = 'test-result error';
    }
  } catch (error) {
    testResultEl.textContent = 'Connection failed: ' + error.message;
    testResultEl.className = 'test-result error';
  } finally {
    testBtn.disabled = false;
    setTimeout(() => {
      testResultEl.textContent = '';
      testResultEl.className = 'test-result';
    }, 5000);
  }
});

exportBtn.addEventListener('click', async () => {
  const settings = collectSettings();
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ai-text-rewriter-settings.json';
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
  importFileEl.click();
});

importFileEl.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const settings = JSON.parse(event.target.result);
      const validKeys = ['provider', 'apiKey', 'model', 'temperature', 'maxTokens',
        'customEndpoint', 'customPromptTemplate', 'rewriteMode', 'customModePrompt'];

      const validSettings = {};
      for (const key of validKeys) {
        if (settings[key] !== undefined) {
          validSettings[key] = settings[key];
        }
      }

      await chrome.storage.local.set({ settings: validSettings });
      loadSettings();
      saveStatusEl.textContent = 'Settings imported successfully';
      saveStatusEl.className = 'save-status success';
      setTimeout(() => {
        saveStatusEl.textContent = '';
        saveStatusEl.className = 'save-status';
      }, 3000);
    } catch (error) {
      saveStatusEl.textContent = 'Failed to import: Invalid JSON file';
      saveStatusEl.className = 'save-status error';
    }
  };
  reader.readAsText(file);
  importFileEl.value = '';
});

document.addEventListener('DOMContentLoaded', loadSettings);
