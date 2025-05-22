// Updated routes.ts with no mock data

import express from 'express';
import { getApiService } from '../services/apiService';
import { NIFTY_TOKENS } from '../utils/securityTokens';
import logger from '../utils/logger';

const router = express.Router();

// Dashboard home route
router.get('/dashboard', async (req, res) => {
  try {
    const apiService = getApiService();
    
    // Get profile information
    const profileData = await apiService.getProfile();
    
    // Get funds & margins
    const rmsData = await apiService.getRMS();
    
    // Return data for the dashboard
    res.status(200).json({
      status: true,
      message: 'Dashboard data retrieved successfully',
      data: {
        profile: profileData,
        funds: rmsData
      }
    });
  } catch (error) {
    logger.error('Failed to get dashboard data:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to get dashboard data',
      data: null
    });
  }
});

// Get NIFTY options data
router.get('/options', async (req, res) => {
  const { expiry } = req.query;
  if (!expiry) return res.status(400).json({ status: false, message: 'expiry required' });

  try {
    const apiService = getApiService();
    const chain = await apiService.getNiftyOptionsData(String(expiry));
    res.json({ status: true, data: chain });
  } catch (err: any) {
    res.status(500).json({ status: false, message: err.message });
  }
});

// Get NIFTY market data
router.get('/market-data', async (req, res) => {
  try {
    const apiService = getApiService();
    
    // Get NIFTY spot data
    const niftySpotData = await apiService.getMarketData({
      mode: "FULL",
      exchangeTokens: {
        "NSE": [NIFTY_TOKENS.NIFTY_INDEX.token] // NIFTY 50 token
      }
    });
    
    // Get NIFTY futures data (assuming nearest expiry)
    const niftyFutureData = await apiService.getMarketData({
      mode: "FULL",
      exchangeTokens: {
        "NFO": [NIFTY_TOKENS.NIFTY_FUTURES_CURRENT.token] // NIFTY futures token
      }
    });
    
    // Process the data
    const marketData = {
      niftySpot: niftySpotData.fetched?.[0]?.ltp || 0,
      niftyChange: niftySpotData.fetched?.[0]?.percentChange || 0,
      niftyFuture: niftyFutureData.fetched?.[0]?.ltp || 0,
      // PCR ratio and IV index would need additional calculations or API calls
      pcrRatio: 0,
      ivIndex: 0
    };
    
    res.status(200).json({
      status: true,
      message: 'Market data retrieved successfully',
      data: marketData
    });
  } catch (error) {
    logger.error('Failed to get market data:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to get market data',
      data: null
    });
  }
});

// Get available expiry dates
router.get('/expiry-dates', (req, res) => {
  try {
    // In a real implementation, you would fetch the actual expiry dates
    // from a database or an API
    
    const today = new Date();
    const expiryDates = [];
    
    // Add current and next 3 Thursdays
    for (let i = 0; i < 4; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + ((4 + 7 - date.getDay()) % 7) + (i * 7));
      
      // Format date as YYYY-MM-DD
      const formattedDate = date.toISOString().split('T')[0];
      
      // Format display date (e.g., "22 May 2025")
      const displayDate = date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      
      expiryDates.push({
        value: formattedDate,
        display: displayDate
      });
    }
    
    res.status(200).json({
      status: true,
      message: 'Expiry dates retrieved successfully',
      data: expiryDates
    });
    
  } catch (error) {
    logger.error('Failed to get expiry dates:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to get expiry dates',
      data: null
    });
  }
});

// Get the current system status and mode
router.get('/system-status', (req, res) => {
  try {
    // In a real-world scenario, this would check system status,
    // market open/close status, exchange connectivity, etc.
    
    const now = new Date();
    const marketOpen = 
      now.getUTCHours() >= 3 && now.getUTCHours() < 10 && // Between 08:30 and 15:30 IST (3:00 and 10:00 UTC)
      now.getDay() >= 1 && now.getDay() <= 5; // Monday to Friday
    
    res.status(200).json({
      status: true,
      message: 'System status retrieved successfully',
      data: {
        serverTime: now.toISOString(),
        serverStatus: 'up',
        marketStatus: marketOpen ? 'open' : 'closed',
        mode: process.env.NODE_ENV || 'production',
        version: '1.0.0'
      }
    });
    
  } catch (error) {
    logger.error('Failed to get system status:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Failed to get system status',
      data: null
    });
  }
});

export default router;