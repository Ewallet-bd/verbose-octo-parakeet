// Content script to monitor DOM updates on merchant websites for new order patterns

console.log("Smart Order Forwarder: Content script loaded and monitoring DOM.");

let processedElements = new WeakSet();

// Regular expressions to detect orders/transactions in text
const amountRegex = /(?:৳|BDT|TK|Tk|tk)?\s*([0-9]{2,6}(?:\.[0-9]{2})?)/i;
const phoneRegex = /(?:01[3-9]\d{8}|\+8801[3-9]\d{8})/g;
const orderIdRegex = /(?:ID|Order|TrxID|Trx|Ref|Invoice)[\s#:]*([A-Za-z0-9]{6,20})/gi;

function extractOrderFromNode(node) {
  if (!node || node.nodeType !== Node.TEXT_NODE) return;
  const text = node.textContent;
  if (!text || text.trim().length < 5) return;

  // Check if text contains order-like keywords
  const lower = text.toLowerCase();
  if (
    lower.includes('order') || 
    lower.includes('amount') || 
    lower.includes('bdt') || 
    lower.includes('৳') || 
    lower.includes('trx') || 
    lower.includes('payment') ||
    lower.includes('success')
  ) {
    // Parent element check to avoid duplicate processing
    const parent = node.parentElement;
    if (!parent || processedElements.has(parent)) return;

    // Extract amount
    const amountMatch = text.match(amountRegex);
    const phoneMatch = text.match(phoneRegex);
    const idMatch = orderIdRegex.exec(text);
    orderIdRegex.lastIndex = 0; // reset since it's a global regex, reused across calls

    if (amountMatch || phoneMatch) {
      processedElements.add(parent);
      
      const orderData = {
        rawText: text.trim(),
        amount: amountMatch ? parseFloat(amountMatch[1]) : null,
        walletNumber: phoneMatch ? phoneMatch[0] : null,
        orderId: idMatch ? idMatch[1] : null,
        detectedAt: new Date().toISOString(),
        sourceUrl: window.location.href
      };

      console.log("Smart Order Forwarder: Detected order pattern in DOM:", orderData);

      // Send to background script for processing & API dispatch
      try {
        chrome.runtime.sendMessage({
          action: "forwardDOMOrder",
          data: orderData
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log("Smart Order Forwarder: Extension context disconnected or error:", chrome.runtime.lastError.message);
            return;
          }
          if (response && response.success) {
            showFloatingBadge(parent);
          }
        });
      } catch (err) {
        console.log("Smart Order Forwarder: sendMessage exception:", err);
      }
    }
  }
}

function showFloatingBadge(element) {
  try {
    const badge = document.createElement('span');
    badge.textContent = '✓ Forwarded';
    badge.style.cssText = 'background: #10b981; color: white; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: bold; z-index: 999999; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.2);';
    element.appendChild(badge);
    setTimeout(() => {
      badge.remove();
    }, 4000);
  } catch (e) {
    // Ignore DOM styling errors
  }
}

// Observe DOM mutations
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        extractOrderFromNode(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Walk child text nodes
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null, false);
        let textNode;
        while (textNode = walker.nextNode()) {
          extractOrderFromNode(textNode);
        }
      }
    }
  }
});

// Start observing the whole document body
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}
