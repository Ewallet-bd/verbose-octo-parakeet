import React, { useState, useCallback } from 'react';

export function useCopyToClipboard(timeout = 2000) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const copy = useCallback((text: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!text) return;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(text);
      setToastMessage("Copied!");
      setTimeout(() => {
        setCopiedText(null);
        setToastMessage(null);
      }, timeout);
    }).catch((err) => {
      console.error("Copy failed", err);
    });
  }, [timeout]);

  return { copy, copiedText, toastMessage };
}
