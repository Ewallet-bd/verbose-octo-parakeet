export const apiFetch = async (url: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
  
  try {
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }

    // Wrap json() method so calling res.json() never crashes on HTML or non-JSON responses
    const originalJson = response.json.bind(response);
    response.json = async () => {
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        // If it starts with HTML or is not JSON
        try {
          return JSON.parse(text);
        } catch {
          return { error: text || `Server returned HTTP ${response.status} (${response.statusText})` };
        }
      }
      try {
        return await originalJson();
      } catch {
        return { error: `Invalid JSON response (HTTP ${response.status})` };
      }
    };

    return response;
  } catch (networkError: any) {
    // Use console.warn instead of console.error to avoid flagging transient polling errors (like during server restart) as fatal app errors
    console.warn('Fetch network error:', networkError.message || networkError);
    // Return a fake response object so downstream callers don't throw uncaught TypeError: Failed to fetch
    return {
      ok: false,
      status: 0,
      statusText: 'Network Error',
      headers: new Headers(),
      json: async () => ({ error: 'সার্ভারের সাথে সংযোগ স্থাপন করা সম্ভব হয়নি (Network/Server connection failed)' }),
      text: async () => 'Network Error'
    } as unknown as Response;
  }
};

