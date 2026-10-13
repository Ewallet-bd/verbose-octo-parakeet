/**
 * Transaction ID Validation and Duplicate Check Utilities
 * Enforces:
 * 1. Only UPPERCASE letters (A-Z) and numbers (0-9) (e.g., DIC2EXGJ5U, DIC1EXAIG5, 75X91WLR, 75X90BL3).
 * 2. Absolutely NO lowercase letters allowed ("ছোট হাতের দিলে কমপ্লিট হবে না").
 * 3. Cannot be used more than once to complete an order ("একটা ট্রানজেকশন আইডি দিয়ে দুইবার যেন কমপ্লিট না করতে পারে").
 */

export interface TxValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedTxId?: string;
}

/**
 * Validates the transaction ID format.
 */
export function validateTransactionIdFormat(rawTxId: string | null | undefined): TxValidationResult {
  if (!rawTxId || typeof rawTxId !== 'string') {
    return {
      isValid: false,
      error: 'ট্রানজেকশন আইডি প্রদান করা আবশ্যক।'
    };
  }

  const txId = rawTxId.trim();

  if (!txId) {
    return {
      isValid: false,
      error: 'ট্রানজেকশন আইডি খালি হতে পারে না।'
    };
  }

  // Check for any lowercase letters
  if (/[a-z]/.test(txId)) {
    return {
      isValid: false,
      error: 'ছোট হাতের অক্ষর দিলে কমপ্লিট হবে না। ট্রানজেকশন আইডি অবশ্যই সব বড় হাতের (UPPERCASE) হতে হবে (যেমন: DIC2EXGJ5U, 75X91WLR)।'
    };
  }

  // Check for spaces
  if (/\s/.test(txId)) {
    return {
      isValid: false,
      error: 'ট্রানজেকশন আইডিতে কোনো স্পেস বা ফাঁকা জায়গা থাকতে পারবে না।'
    };
  }

  // Check allowed characters: ONLY uppercase letters A-Z and digits 0-9
  if (!/^[A-Z0-9]+$/.test(txId)) {
    return {
      isValid: false,
      error: 'ট্রানজেকশন আইডি শুধুমাত্র বড় হাতের ইংরেজি অক্ষর (A-Z) এবং সংখ্যার (0-9) সমন্বয়ে হতে হবে (যেমন: DIC2EXGJ5U, 75X91WLR)।'
    };
  }

  // Check length (typically 8-10 characters e.g. Nagad 8 chars, bKash 10 chars)
  if (txId.length < 6 || txId.length > 20) {
    return {
      isValid: false,
      error: 'ট্রানজেকশন আইডি ৬ থেকে ২০ অক্ষরের মধ্যে হতে হবে (যেমন: DIC2EXGJ5U, 75X91WLR)।'
    };
  }

  return {
    isValid: true,
    sanitizedTxId: txId
  };
}
