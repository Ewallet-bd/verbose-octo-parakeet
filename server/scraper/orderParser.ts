import { ScrapedOrder } from './types';

/**
 * Normalizes payment method string into standard enum
 */
export function normalizePaymentMethod(rawMethod?: string): 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY' | 'CASH_OUT' {
  if (!rawMethod) return 'BKASH';
  const clean = rawMethod.toUpperCase().replace(/\s+/g, '');
  if (clean.includes('BKASH') || clean.includes('বিবিকাশ') || clean.includes('বিকাশ')) return 'BKASH';
  if (clean.includes('NAGAD') || clean.includes('নগদ')) return 'NAGAD';
  if (clean.includes('ROCKET') || clean.includes('রকেট')) return 'ROCKET';
  if (clean.includes('UPAY') || clean.includes('উপায়')) return 'UPAY';
  return 'CASH_OUT';
}

/**
 * Cleans phone number to standard 11-digit BD wallet number (e.g., 01XXXXXXXXX)
 */
export function normalizeWalletNumber(rawNumber?: string): string {
  if (!rawNumber) return '';
  const digits = rawNumber.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('01')) {
    return digits;
  }
  if (digits.length === 13 && digits.startsWith('8801')) {
    return digits.substring(2);
  }
  if (digits.length === 14 && digits.startsWith('+8801')) {
    return digits.substring(3);
  }
  return digits || rawNumber.trim();
}

/**
 * Parses raw JSON item or HTML table row representation into a standardized ScrapedOrder
 */
export function parseRawOrder(item: any): ScrapedOrder | null {
  if (!item || typeof item !== 'object') return null;

  const orderId = String(
    item.order_id || 
    item.orderId || 
    item.id || 
    item.request_id || 
    item.requestId || 
    item.reference || 
    item.tx_id || 
    item.transaction_id || 
    ''
  ).trim();

  const rawAmount = item.amount || item.money || item.total || item.cash;
  const amount = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount || '0').replace(/[^0-9.]/g, ''));

  const rawWallet = String(
    item.wallet_number || 
    item.walletNumber || 
    item.phone || 
    item.mobile || 
    item.account || 
    item.number || 
    ''
  );

  const walletNumber = normalizeWalletNumber(rawWallet);
  const paymentMethod = normalizePaymentMethod(item.payment_method || item.paymentMethod || item.method || item.channel || item.gateway);

  if (!orderId || isNaN(amount) || amount <= 0 || !walletNumber) {
    return null;
  }

  return {
    orderId,
    amount,
    paymentMethod,
    walletNumber,
    requestedAt: item.created_at || item.createdAt || item.date || item.time || new Date().toISOString(),
    status: item.status || 'PENDING',
    raw: item,
  };
}
