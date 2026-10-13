import { automationCrawler } from './crawler';
import { ScraperConfig, AutomationStatus, AutomationLog } from './types';

export { automationCrawler };
export * from './types';
export * from './orderParser';
export * from './sessionManager';

export const automationService = {
  getStatus: (): AutomationStatus => {
    return automationCrawler.getStatus();
  },

  getConfig: (): ScraperConfig => {
    return automationCrawler.getConfig();
  },

  updateConfig: (config: Partial<ScraperConfig>): AutomationStatus => {
    return automationCrawler.updateConfig(config);
  },

  start: async () => {
    return automationCrawler.start();
  },

  stop: async () => {
    return automationCrawler.stop();
  },

  submitOtp: async (code: string, source: 'TELEGRAM' | 'WEB' = 'WEB') => {
    return automationCrawler.submitOtp(code, source);
  },

  clearSession: () => {
    return automationCrawler.clearSession();
  },

  syncNow: async () => {
    return automationCrawler.scrapeOrdersOnce();
  },

  getLogs: (limit: number = 50): AutomationLog[] => {
    return automationCrawler.getLogs(limit);
  },

  clearLogs: () => {
    automationCrawler.clearLogs();
  },

  reloadPage: async () => {
    return automationCrawler.reloadPage();
  },

  getScreenshot: async () => {
    return automationCrawler.getScreenshot();
  },

  /**
   * For testing & demonstration: ingests mock orders into the deduplication pipeline
   */
  simulateIncomingOrders: async (items: any[]) => {
    automationCrawler.addLog('INFO', `Simulating ingestion of ${items.length} orders`);
    return automationCrawler.processRawOrderItems(items);
  }
};
