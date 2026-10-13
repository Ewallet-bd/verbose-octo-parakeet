// Create the context menu when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "sendOrder",
    title: "Send as Order to Dashboard",
    contexts: ["selection"] // Show only when text is selected
  });
});

// Handle the context menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "sendOrder") {
    const selectedText = info.selectionText;
    
    if (selectedText) {
      sendOrderToAPI(selectedText);
    }
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "forwardDOMOrder" && request.data) {
    sendDOMOrderToAPI(request.data).then(success => {
      sendResponse({ success });
    }).catch(() => {
      sendResponse({ success: false });
    });
    return true; // Will respond asynchronously
  }
});

async function sendOrderToAPI(text) {
  // Get API URL and Token from storage
  chrome.storage.sync.get(['apiUrl', 'apiToken'], async (items) => {
    const apiUrl = items.apiUrl;
    const apiToken = items.apiToken;

    if (!apiUrl || !apiToken) {
      showNotification("Configuration Error", "Please set API URL and Token in extension options.");
      return;
    }

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`
        },
        body: JSON.stringify({ rawText: text })
      });

      const data = await response.json();

      if (response.ok) {
        showNotification("Success!", "Order forwarded successfully!");
      } else {
        showNotification("Error", data.error || "Failed to forward order.");
      }
    } catch (error) {
      console.error(error);
      showNotification("Network Error", "Could not connect to the system API.");
    }
  });
}

async function sendDOMOrderToAPI(orderData) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiUrl', 'apiToken'], async (items) => {
      const apiUrl = items.apiUrl;
      const apiToken = items.apiToken;

      if (!apiUrl || !apiToken) {
        resolve(false);
        return;
      }

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiToken}`
          },
          body: JSON.stringify({
            rawText: orderData.rawText,
            walletNumber: orderData.walletNumber,
            amount: orderData.amount,
            sourceUrl: orderData.sourceUrl
          })
        });

        if (response.ok) {
          showNotification("DOM Order Captured!", `Amount: ৳${orderData.amount || 'N/A'}`);
          resolve(true);
        } else {
          resolve(false);
        }
      } catch (error) {
        console.error(error);
        resolve(false);
      }
    });
  });
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsQAAA7EAZUrDhsAAAANSURBVBhXYzh8+PB/AAffA0nNPuPnAAAAAElFTkSuQmCC', // 1x1 transparent pixel fallback
    title: title,
    message: message
  });
}
