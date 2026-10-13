export function parsePaymentRequest(text: string) {
  const result = {
    request_id: '',
    wallet_number: '',
    raw_wallet_number: '',
    amount: 0,
    payment_method: 'UNKNOWN',
    assigned_user: '',
    confidence: 'LOW',
    raw_message: text
  };

  // Request ID
  const idMatch = text.match(/(?:ID|Request ID|🆔 ID|Withdrawal Request №|№)\s*[:\-]?\s*(\d+)/i);
  if (idMatch) result.request_id = idMatch[1];

  // Wallet Number
  const walletMatch = text.match(/(?:Payment number|Account number|Nagad Number|bKash Number|Number|Wallet|নাম্বার|মোবাইল|বিকাশ নাম্বার|নগদ নাম্বার|📱 Nagad Number)\s*[:\-]?\s*(\+?8801\d{8}|01\d{9})/i)
    || text.match(/(?:Nagad|bKash|Rocket|Upay)\s*[:\-]?\s*(\+?8801\d{8}|01\d{9})/i);
  
  if (walletMatch) {
    result.raw_wallet_number = walletMatch[1];
    result.wallet_number = walletMatch[1].replace(/^\+?88/, ''); // Normalize to 01XXXXXXXXX
  }

  // Amount
  const amountMatch = text.match(/(?:Amount|টাকার পরিমাণ|💰 Amount)\s*[:\-]?\s*(?:BDT|৳|Tk)?\s*([\d,\s]+(?:\.\d+)?)/i)
    || text.match(/[৳$]\s*([\d,\s]+(?:\.\d+)?)/i);
  
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1].replace(/[, ]/g, ''));
  }

  // Assigned User
  const assignedMatch = text.match(/(?:Assigned|Assign|👤 Assigned)\s*[:\-]?\s*([A-Za-z0-9_]+)/i);
  if (assignedMatch) result.assigned_user = assignedMatch[1].toUpperCase();

  // Payment Method
  const textLower = text.toLowerCase();
  if (textLower.includes('nagad') || textLower.includes('নগদ')) result.payment_method = 'NAGAD';
  else if (textLower.includes('bkash') || textLower.includes('বিকাশ')) result.payment_method = 'BKASH';
  else if (textLower.includes('rocket') || textLower.includes('রকেট')) result.payment_method = 'ROCKET';
  else if (textLower.includes('upay') || textLower.includes('উপায়')) result.payment_method = 'UPAY';

  // Confidence Calculation
  let fieldsDetected = 0;
  if (result.request_id) fieldsDetected++;
  if (result.wallet_number) fieldsDetected++;
  if (result.amount > 0) fieldsDetected++;

  if (fieldsDetected === 3) result.confidence = 'HIGH';
  else if (fieldsDetected === 2) result.confidence = 'MEDIUM';
  else result.confidence = 'LOW';

  return result;
}
