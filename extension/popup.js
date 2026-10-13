document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const apiTokenInput = document.getElementById('apiToken');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // Load existing settings
  chrome.storage.sync.get(['apiUrl', 'apiToken'], (items) => {
    if (items.apiUrl) apiUrlInput.value = items.apiUrl;
    if (items.apiToken) apiTokenInput.value = items.apiToken;
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const apiUrl = apiUrlInput.value.trim();
    const apiToken = apiTokenInput.value.trim();

    chrome.storage.sync.set({ apiUrl, apiToken }, () => {
      statusDiv.style.display = 'block';
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 2000);
    });
  });
});
