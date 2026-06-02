async function callOpenAI(settings, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.maxTokens || 2048
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callAnthropic(settings, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: settings.model || 'claude-sonnet-4-20250514',
      max_tokens: settings.maxTokens || 2048,
      temperature: settings.temperature ?? 0.7,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return data.content[0].text.trim();
}

async function callGemini(settings, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${settings.model || 'gemini-2.0-flash'}:generateContent?key=${settings.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: settings.temperature ?? 0.7,
          maxOutputTokens: settings.maxTokens || 2048
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text.trim();
}

async function callDeepSeek(settings, prompt) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.maxTokens || 2048
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `DeepSeek API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

async function callCustomEndpoint(settings, prompt) {
  const response = await fetch(settings.customEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.maxTokens || 2048
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Custom API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

const PROVIDERS = {
  openai: callOpenAI,
  anthropic: callAnthropic,
  gemini: callGemini,
  deepseek: callDeepSeek,
  custom: callCustomEndpoint
};

async function callAIProvider(settings, prompt) {
  const providerFn = PROVIDERS[settings.provider];
  if (!providerFn) {
    throw new Error(`Unknown provider: ${settings.provider}`);
  }
  return await providerFn(settings, prompt);
}

async function testConnection(settings) {
  const testPrompt = 'Reply with exactly "OK" and nothing else.';
  const result = await callAIProvider(settings, testPrompt);
  return result.includes('OK');
}
