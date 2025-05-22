import express from 'express';
import winston from 'winston';
import dotenv from 'dotenv';
import { cacheService } from './services/cacheService';
import { dbService } from './services/dbService';

// Initialize environment variables
dotenv.config();

// Set up logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

// Create Express app
const app = express();
const port = 3000;

async function verifySetup() {
  logger.info('Checking Node.js version: ' + process.version);
  
  // Test node-cache
  try {
    cacheService.set('test', 'value');
    const value = cacheService.get('test');
    if (value === 'value') {
      logger.info('NodeCache is working properly');
    }
    cacheService.del('test');
  } catch (error) {
    logger.error('NodeCache error:', error);
  }
  
  // Test SQLite
  try {
    dbService.saveOptions([{
      token: 'test-token',
      symbol: 'NIFTY',
      strike: 22000,
      optType: 'CE',
      expiry: '2025-05-22',
      lotSize: 75,
      tickSize: 5
    }]);
    
    const option = dbService.getOptionByToken('test-token');
    if (option && option.symbol === 'NIFTY') {
      logger.info('SQLite database is working properly');
    }
  } catch (error) {
    logger.error('SQLite error:', error);
  }
  
  logger.info('Express initialized successfully');
  logger.info('All core dependencies verified');
}

// Run verification
verifySetup().catch(console.error);

// Export the app for testing
export default app;