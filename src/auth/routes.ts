// Updated auth/routes.ts without mockLogin reference

import express from 'express';
import { getApiService } from '../services/apiService';
import logger from '../utils/logger';

const router = express.Router();

// Login route
router.post('/login', async (req, res) => {
  try {
    logger.info('Login request received');
    const { clientId, password, totp } = req.body;
    
    logger.info(`Login attempt for client: ${clientId}`);
    
    if (!clientId || !password) {
      logger.warn('Missing login credentials');
      return res.status(400).json({
        status: false,
        message: 'Client ID and password are required',
        data: null
      });
    }
    
    const credentials = {
      clientId,
      password,
      totp: totp || '' // TOTP might be generated automatically if not provided
    };
    
    const apiService = getApiService();
    
    try {
      logger.info('Attempting to login with Angel One API');
      
      // Always use the regular login method
      const tokens = await apiService.login(credentials);
      
      return res.status(200).json({
        status: true,
        message: 'Login successful',
        data: {
          success: true
        }
      });
    } catch (loginError) {
      logger.error(`Login error: ${loginError}`);
      return res.status(401).json({
        status: false,
        message: loginError instanceof Error ? loginError.message : 'Login failed',
        data: null
      });
    }
  } catch (error) {
    logger.error('Login route error:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Internal server error',
      data: null
    });
  }
});

// Logout route
router.post('/logout', async (req, res) => {
  try {
    const apiService = getApiService();
    const success = await apiService.logout();
    
    res.status(200).json({
      status: true,
      message: 'Logout successful',
      data: { success }
    });
  } catch (error) {
    logger.error('Logout failed:', error);
    res.status(500).json({
      status: false,
      message: error instanceof Error ? error.message : 'Logout failed',
      data: null
    });
  }
});

export default router;