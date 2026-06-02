const DEFAULT_SETTINGS = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2048,
  customEndpoint: '',
  customPromptTemplate: 'Rewrite the following text: {{text}}',
  rewriteMode: 'improve-grammar',
  customModePrompt: ''
};

const REWRITE_MODES = {
  'improve-grammar': {
    name: 'Improve Grammar',
    prompt: 'Correct grammar, spelling, and punctuation errors in the following text. Return only the corrected version, without explanations or additional text.\n\n{{text}}'
  },
  'professional-tone': {
    name: 'Professional Tone',
    prompt: 'Rewrite the following text in a professional business tone. Use formal language appropriate for workplace communication. Return only the rewritten version.\n\n{{text}}'
  },
  'friendly-tone': {
    name: 'Friendly Tone',
    prompt: 'Rewrite the following text in a warm, friendly, and conversational tone. Return only the rewritten version.\n\n{{text}}'
  },
  'concise': {
    name: 'Concise Version',
    prompt: 'Rewrite the following text more concisely while preserving the key message. Remove unnecessary words but keep the meaning intact. Return only the rewritten version.\n\n{{text}}'
  },
  'expand': {
    name: 'Expand Content',
    prompt: 'Expand the following text with more detail, examples, and elaboration while maintaining the original intent. Return only the expanded version.\n\n{{text}}'
  },
  'simplify': {
    name: 'Simplify Content',
    prompt: 'Simplify the following text to make it easier to understand. Use simpler words and shorter sentences. Return only the simplified version.\n\n{{text}}'
  },
  'business-communication': {
    name: 'Business Communication',
    prompt: 'Rewrite the following text as a formal business communication. Use professional language suitable for memos, reports, or official correspondence. Return only the rewritten version.\n\n{{text}}'
  },
  'email-style': {
    name: 'Email Style',
    prompt: 'Rewrite the following text in the style of a professional email. Use appropriate email etiquette and structure. Return only the rewritten version.\n\n{{text}}'
  },
  'custom': {
    name: 'Custom Prompt',
    prompt: '{{custom}}'
  }
};

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  if (result.settings) {
    return { ...DEFAULT_SETTINGS, ...result.settings };
  }
  return { ...DEFAULT_SETTINGS };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

async function getApiKey() {
  const settings = await getSettings();
  return settings.apiKey;
}

function getPromptForMode(mode, text, customPrompt) {
  const modeConfig = REWRITE_MODES[mode];
  if (!modeConfig) {
    return text;
  }

  let prompt = modeConfig.prompt;
  if (mode === 'custom') {
    prompt = prompt.replace('{{custom}}', customPrompt || '');
  }
  return prompt.replace('{{text}}', text);
}

function getPromptName(mode) {
  const modeConfig = REWRITE_MODES[mode];
  return modeConfig ? modeConfig.name : mode;
}
