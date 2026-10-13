/**
 * Completion Tracker
 * Tracks Telegram messages involved in the payment order completion flow:
 * 1. The bot's "Please send the Transaction ID for Request: ..." prompt
 * 2. User input messages (attempts with transaction IDs)
 * 3. Bot validation error messages (lowercase warning, invalid characters, duplicates)
 *
 * When an order is completed (or cancelled), all tracked intermediate messages
 * are automatically deleted from the Telegram chat so that the group remains clean.
 */

interface CompletionThread {
  chatId: number | string;
  reqId: string;
  messageIds: Set<number>;
  lastActivity: number;
}

// Map key: `${chatId}:${reqId}`
const threads = new Map<string, CompletionThread>();

// Reverse lookup: `${chatId}:${messageId}` -> reqId
const messageToReqId = new Map<string, string>();

/**
 * Track a message ID related to an order completion flow in a chat.
 */
export function trackCompletionMessage(
  chatId: number | string | undefined | null,
  reqId: string | undefined | null,
  messageId: number | undefined | null
) {
  if (!chatId || !reqId || !messageId) return;

  const key = `${chatId}:${reqId}`;
  let thread = threads.get(key);
  if (!thread) {
    thread = {
      chatId,
      reqId,
      messageIds: new Set<number>(),
      lastActivity: Date.now()
    };
    threads.set(key, thread);
  }

  thread.messageIds.add(messageId);
  thread.lastActivity = Date.now();

  messageToReqId.set(`${chatId}:${messageId}`, reqId);
}

/**
 * Find the associated Request ID given a chatId and a replied messageId.
 */
export function findReqIdByMessage(
  chatId: number | string | undefined | null,
  messageId: number | undefined | null
): string | null {
  if (!chatId || !messageId) return null;
  return messageToReqId.get(`${chatId}:${messageId}`) || null;
}

/**
 * Delete all tracked completion prompt, error, and user attempt messages for a request.
 */
export async function cleanupCompletionMessages(
  botApi: any,
  chatId: number | string | undefined | null,
  reqId: string | undefined | null,
  extraMessageIds: (number | undefined | null)[] = []
) {
  if (!botApi || !chatId || !reqId) return;

  const key = `${chatId}:${reqId}`;
  const thread = threads.get(key);

  const idsToDelete = new Set<number>();

  for (const id of extraMessageIds) {
    if (typeof id === 'number' && id > 0) {
      idsToDelete.add(id);
    }
  }

  if (thread) {
    for (const id of thread.messageIds) {
      idsToDelete.add(id);
      messageToReqId.delete(`${chatId}:${id}`);
    }
    threads.delete(key);
  }

  // Delete all messages concurrently or in rapid sequence
  const deletionPromises = Array.from(idsToDelete).map(async (msgId) => {
    try {
      await botApi.deleteMessage(chatId, msgId);
    } catch {
      // Ignore if already deleted by user or permissions error
    }
  });

  await Promise.allSettled(deletionPromises);
}

// Periodic cleanup of stale threads older than 24 hours
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000;
  for (const [key, thread] of threads.entries()) {
    if (now - thread.lastActivity > maxAge) {
      for (const id of thread.messageIds) {
        messageToReqId.delete(`${thread.chatId}:${id}`);
      }
      threads.delete(key);
    }
  }
}, 30 * 60 * 1000);
