document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('open-repo').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://github.com/prabu-kumarasamy/ai-text-rewriter' });
});
