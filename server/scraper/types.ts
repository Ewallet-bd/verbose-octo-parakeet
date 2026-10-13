export type AutomationStatusType = 
  | 'IDLE' 
  | 'LOGGING_IN' 
  | 'AWAITING_OTP' 
  | 'AWAITING_CAPTCHA'
  | 'ACTIVE_POLLING' 
  | 'PAUSED' 
  | 'ERROR';

export interface ScraperConfig {
  portalUrl: string;
  username: string;
  password: string;
  pollIntervalSeconds: number;
  enabled: boolean;
  headless: boolean;
  autoLogin: boolean;
  notifyTelegramOnNewOrders: boolean;
  notifyTelegramOnLoginLogout?: boolean;
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  otpSelector?: string;
  otpSubmitSelector?: string;
  ordersUrl?: string;
  tableSelector?: string;
  autoReloadOnCaptcha?: boolean;
  captchaSelector?: string;
}

export interface AutomationLog {
  id: string;
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
  details?: any;
}

export interface ScrapedOrder {
  orderId: string;
  amount: number;
  paymentMethod: 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY' | 'CASH_OUT';
  walletNumber: string;
  requestedAt?: string;
  status?: string;
  raw?: any;
}

export interface AutomationStatus {
  status: AutomationStatusType;
  isRunning: boolean;
  isLoggedIn: boolean;
  hasStoredSession: boolean;
  awaitingOtp: boolean;
  hasCaptcha?: boolean;
  captchaDetails?: string;
  otpPromptMessage?: string;
  otpRequestedAt?: number;
  otpExpiresAt?: number;
  lastPollAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  totalOrdersFetched: number;
  totalOrdersImported: number;
  totalOrdersDuplicates: number;
  screenshot?: string;
  currentUrl?: string;
  config: ScraperConfig;
}
