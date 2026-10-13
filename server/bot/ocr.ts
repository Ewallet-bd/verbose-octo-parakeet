export interface PaddleHealthStatus {
  status: 'healthy' | 'attention_required' | 'not_configured';
  isHealthy: boolean;
  message: string;
  url: string;
  lastChecked: number;
}

let cachedPaddleHealth: PaddleHealthStatus | null = null;

// Default to local microservice port 5000 if not specified
export const DEFAULT_PADDLE_OCR_URL = 'http://127.0.0.1:5000/ocr';

export function getPaddleOCRUrl(): string {
  return (process.env.PADDLE_OCR_URL?.trim() || DEFAULT_PADDLE_OCR_URL);
}

/**
 * Checks the health of the local/remote PaddleOCR microservice
 */
export async function checkPaddleHealth(forceRefresh = false): Promise<PaddleHealthStatus> {
  const now = Date.now();
  if (!forceRefresh && cachedPaddleHealth && (now - cachedPaddleHealth.lastChecked < 60000)) {
    return cachedPaddleHealth;
  }

  const paddleUrl = getPaddleOCRUrl();

  try {
    const parsed = new URL(paddleUrl);
    const healthUrl = `${parsed.protocol}//${parsed.host}/health`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    
    let res: Response | null = null;
    try {
      res = await fetch(healthUrl, { signal: controller.signal });
    } catch {
      // Offline / unreachable
      clearTimeout(timeout);
      cachedPaddleHealth = {
        status: 'not_configured',
        isHealthy: false,
        message: `PaddleOCR microservice is currently offline at ${paddleUrl}. On VPS, run 'pm2 start ecosystem.config.cjs' or 'bash ocr_service/start.sh'.`,
        url: paddleUrl,
        lastChecked: now
      };
      return cachedPaddleHealth;
    }
    clearTimeout(timeout);

    if (res && res.ok) {
      cachedPaddleHealth = {
        status: 'healthy',
        isHealthy: true,
        message: 'Open-Source PaddleOCR engine is active and ready (Unlimited offline processing).',
        url: paddleUrl,
        lastChecked: now
      };
      return cachedPaddleHealth;
    }

    cachedPaddleHealth = {
      status: 'attention_required',
      isHealthy: false,
      message: `PaddleOCR service returned HTTP ${res?.status || 'error'}.`,
      url: paddleUrl,
      lastChecked: now
    };
    return cachedPaddleHealth;
  } catch {
    cachedPaddleHealth = {
      status: 'not_configured',
      isHealthy: false,
      message: `PaddleOCR microservice is offline at ${paddleUrl}.`,
      url: paddleUrl,
      lastChecked: now
    };
    return cachedPaddleHealth;
  }
}

/**
 * Extracts text using the open-source PaddleOCR microservice.
 * Fully offline, unlimited, zero external API keys.
 */
export async function extractWithPaddleOCR(buffer: Buffer, mimeType: string, customUrl?: string): Promise<string | null> {
  const endpoint = customUrl || getPaddleOCRUrl();

  try {
    const base64Data = buffer.toString('base64');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const isBase64Endpoint = endpoint.endsWith('/base64');
    const targetUrl = isBase64Endpoint 
      ? endpoint 
      : (endpoint.endsWith('/ocr') ? `${endpoint}/base64` : `${endpoint.replace(/\/+$/, '')}/ocr/base64`);

    let response: Response | null = null;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: `data:${mimeType};base64,${base64Data}` }),
        signal: controller.signal
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      // Service offline or connection refused — log informational warning without triggering fatal errors
      console.warn(`[PaddleOCR] Service offline at ${targetUrl}:`, fetchErr?.message || 'Connection refused');
      return null;
    }

    // If 404 on base64, try fallback multipart form-data
    if (response && !response.ok && response.status === 404) {
      const fallbackUrl = endpoint.endsWith('/ocr') ? endpoint : `${endpoint.replace(/\/+$/, '')}/ocr`;
      try {
        const formData = new FormData();
        const blob = new Blob([buffer], { type: mimeType });
        formData.append('file', blob, 'screenshot.jpg');
        response = await fetch(fallbackUrl, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
      } catch (fallbackErr: any) {
        clearTimeout(timeout);
        console.warn(`[PaddleOCR] Multipart fallback failed:`, fallbackErr?.message || 'Connection refused');
        return null;
      }
    }

    clearTimeout(timeout);

    if (!response || !response.ok) {
      console.warn(`[PaddleOCR] Service responded with HTTP ${response?.status}`);
      return null;
    }

    const json = await response.json() as any;
    if (json && typeof json.text === 'string' && json.text.trim()) {
      return json.text.trim();
    }
    if (json && Array.isArray(json.lines) && json.lines.length > 0) {
      return json.lines.join('\n');
    }
    return null;
  } catch (err: any) {
    console.warn("[PaddleOCR] Extraction skipped:", err?.message || err);
    return null;
  }
}

/**
 * Cloud / Development Fallback using Gemini Flash when PaddleOCR microservice is not running
 * and GEMINI_API_KEY is available.
 */
async function extractWithGeminiFallback(buffer: Buffer, mimeType: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const base64Data = buffer.toString('base64');

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType || 'image/jpeg'
              }
            },
            {
              text: 'Extract all visible text from this image accurately. Preserve numbers, transaction IDs, dates, and amounts. Return ONLY the raw extracted text with no commentary or markdown backticks.'
            }
          ]
        }
      ]
    });

    const text = response.text?.trim();
    if (text) {
      console.log(`[OCR] Extracted text via Gemini Flash fallback (${text.length} characters)`);
      return text;
    }
    return null;
  } catch (err: any) {
    console.warn('[OCR] Gemini Flash fallback extraction failed:', err?.message || err);
    return null;
  }
}

/**
 * Primary OCR Entry Point:
 * 1. Tries local/configured PaddleOCR first (Primary Engine for VPS deployment).
 * 2. If PaddleOCR is offline and GEMINI_API_KEY is present, seamlessly falls back to Gemini Flash.
 * 3. Returns null gracefully if OCR services are unavailable.
 */
export async function extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string | null> {
  // Step 1: Try PaddleOCR
  try {
    const text = await extractWithPaddleOCR(buffer, mimeType);
    if (text) {
      console.log(`[PaddleOCR] Successfully extracted text (${text.length} characters)`);
      return text;
    }
  } catch {
    // Gracefully proceed to fallback
  }

  // Step 2: Fallback to Gemini Flash if API key is present
  if (process.env.GEMINI_API_KEY) {
    const geminiText = await extractWithGeminiFallback(buffer, mimeType);
    if (geminiText) {
      return geminiText;
    }
  }

  console.log('[OCR] No OCR engine available or extraction yielded empty text.');
  return null;
}
