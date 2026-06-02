const DEFAULT_SETTINGS = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 2048,
  customEndpoint: '',
  customPromptTemplate: '',
  rewriteMode: 'improve-grammar',
  customModePrompt: '',
  voiceLang: 'en-US',
  translateTarget: 'es',
  translateSource: 'auto'
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
  'translate': {
    name: 'Translate',
    prompt: 'Translate the following text{{source}} to {{target}}. Return only the translated version, without explanations or additional text.\n\n{{text}}'
  },
  'custom': {
    name: 'Custom Prompt',
    prompt: '{{custom}}'
  }
};

const LANGUAGES = {
  'auto': 'Auto Detect',
  'af': 'Afrikaans', 'ar': 'Arabic', 'bg': 'Bulgarian', 'bn': 'Bengali',
  'ca': 'Catalan', 'cs': 'Czech', 'cy': 'Welsh', 'da': 'Danish',
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

const VOICE_LANGUAGES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Mandarin)' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'ar-SA', name: 'Arabic' }
];

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

async function getRewriteHistory() {
  const result = await chrome.storage.local.get('rewriteHistory');
  return result.rewriteHistory || [];
}

async function addToHistory(entry) {
  const history = await getRewriteHistory();
  history.unshift({ ...entry, timestamp: Date.now() });
  if (history.length > 20) history.pop();
  await chrome.storage.local.set({ rewriteHistory: history });
}

function getPromptForMode(mode, text, customPrompt, translateOpts) {
  const modeConfig = REWRITE_MODES[mode];
  if (!modeConfig) return text;

  let prompt = modeConfig.prompt;
  if (mode === 'custom') {
    prompt = prompt.replace('{{custom}}', customPrompt || '');
  }
  if (mode === 'translate') {
    const source = translateOpts?.source && translateOpts.source !== 'auto'
      ? ` from ${LANGUAGES[translateOpts.source] || translateOpts.source}`
      : '';
    prompt = prompt.replace('{{source}}', source);
    prompt = prompt.replace('{{target}}', LANGUAGES[translateOpts?.target] || translateOpts?.target || 'English');
  }
  return prompt.replace('{{text}}', text);
}

function getPromptName(mode) {
  const modeConfig = REWRITE_MODES[mode];
  return modeConfig ? modeConfig.name : mode;
}
