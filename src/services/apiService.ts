// Updated apiService.ts with no mock data generation

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import dotenv from 'dotenv';
import { cacheService } from './cacheService';
import logger from '../utils/logger';
import { totp } from 'otplib';
import { NIFTY_TOKENS, SecurityToken } from '../utils/securityTokens';
import { getScripMaster } from './scripMasterService';
import { buildTokenMap } from '../utils/optionTokenPicker';

// Load environment variables
dotenv.config();

// Define interfaces
export interface AngelOneCredentials {
  clientId: string;
  password: string;
  totp: string;
}

export interface AuthTokens {
  jwtToken: string;
  refreshToken: string;
  feedToken: string;
}

export interface AngelOneApiConfig {
  apiKey: string;
  clientCode: string;
  authTokens?: AuthTokens;
}

export interface MarketDataParams {
  mode: string;
  exchangeTokens: Record<string, string[]>;
}

export interface OptionChainData {
  expiry: string;
  spot: number;
  data: OptionStrikeData[];
}

export interface OptionStrikeData {
  strike: number;
  ce: OptionData;
  pe: OptionData;
}

export interface OptionData {
  oi: number;
  volume: number;
  ltp: number;
  change: string;
}

interface ApiResponseData {
  status: boolean;
  message: string;
  errorcode: string;
  data: any;
}

// Angel One API service
export class AngelOneApiService {
  private axiosInstance: AxiosInstance;
  private apiKey: string;
  private clientCode: string;
  private authTokens?: AuthTokens;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  
  constructor(config: AngelOneApiConfig) {
    this.apiKey = config.apiKey;
    this.clientCode = config.clientCode;
    this.authTokens = config.authTokens;
    
    logger.debug(`AngelOneApiService initialized with:
      - API Key: ${this.apiKey ? this.apiKey.substring(0, 3) + '...' : 'MISSING'}
      - Client Code: ${this.clientCode || 'MISSING'}
      - Auth Tokens: ${this.authTokens ? 'PRESENT' : 'MISSING'}`);
    
    this.axiosInstance = axios.create({
      baseURL: 'https://apiconnect.angelone.in',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
      },
      timeout: 15000 // 15 seconds timeout
    });
    
    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      response => response,
      this.handleApiError.bind(this)
    );
    
    // Add authorization token if available
    if (this.authTokens?.jwtToken) {
      this.setAuthToken(this.authTokens.jwtToken);
    }
    
    // Configure otplib to use 6 digits
    totp.options = { 
      digits: 6,
      window: 1 // Allow a small window for clock drift
    };
  }
  
  private async handleApiError(error: AxiosError): Promise<any> {
    if (!error.response) {
      logger.error(`Network error: ${error.message}`);
      throw new Error(`Network error: ${error.message}`);
    }
    
    const status = error.response.status;
    
    // Handle token expiration (401 Unauthorized)
    if (status === 401 && this.authTokens?.refreshToken && this.retryCount < this.maxRetries) {
      logger.warn('Token expired, attempting to refresh token...');
      
      this.retryCount++;
      
      try {
        await this.refreshTokens();
        
        // Retry the original request with new token
        if (error.config) {
          const config = { ...error.config };
          config.headers = { 
            ...config.headers,
            'Authorization': `Bearer ${this.authTokens?.jwtToken}`
          } as any;
          
          return this.axiosInstance.request(config);
        }
      } catch (refreshError) {
        logger.error(`Failed to refresh token: ${refreshError}`);
        throw new Error('Authentication failed. Please login again.');
      }
    }
    
    // Reset retry count for non-401 errors
    this.retryCount = 0;
    
    if (error.response.data && typeof error.response.data === 'object') {
      const errorData = error.response.data as Record<string, any>;
      logger.error(`API Error: ${JSON.stringify(errorData)}`);
      throw new Error(errorData.message || `Error ${status}: ${error.message}`);
    }
    
    throw error;
  }
  
  // Set authentication token
  public setAuthToken(token: string): void {
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }
  
  // Get common headers for all requests
  private getCommonHeaders(): Record<string, string> {
    return {
      'X-ClientLocalIP': '127.0.0.1',  // Simplified for now
      'X-ClientPublicIP': '127.0.0.1', // Simplified for now
      'X-MACAddress': '00-00-00-00-00-00', // Simplified for now
      'X-PrivateKey': this.apiKey
    };
  }
  
  // Generate TOTP using otplib
  private generateTOTP(): string | null {
    const secret = process.env.TOTP_SECRET;
    if (!secret) {
      logger.error('TOTP secret not found in environment variables');
      return null;
    }
    
    try {
      // Generate a valid 6-digit TOTP code
      const otpCode = totp.generate(secret);
      logger.info(`Successfully generated TOTP code from secret`);
      return otpCode;
    } catch (error) {
      logger.error(`Error generating TOTP: ${error}`);
      return null;
    }
  }
  
  // Login to Angel One
  public async login(credentials: AngelOneCredentials): Promise<AuthTokens> {
    try {
      logger.info(`Attempting to login with client ID: ${credentials.clientId}`);
      
      // Validate TOTP format - it should be a 6-digit number if provided manually
      let otpCode = credentials.totp?.trim();
      
      // If totp is provided but doesn't match the 6-digit format, reject it immediately
      if (otpCode && !/^\d{6}$/.test(otpCode)) {
        logger.error(`Invalid TOTP format: ${otpCode}. Expected 6 digits.`);
        throw new Error('Invalid TOTP format. Please provide a 6-digit code.');
      }
      
      // If no TOTP provided, generate it automatically
      if (!otpCode) {
        const generatedOtp = this.generateTOTP();
        if (!generatedOtp) {
          throw new Error('Failed to generate TOTP. Please check your TOTP_SECRET environment variable.');
        }
        otpCode = generatedOtp;
        logger.info(`Generated TOTP automatically`);
      }
      
      // Create request body
      const requestBody = {
        clientcode: credentials.clientId,
        password: credentials.password,
        totp: otpCode
      };
      
      logger.info(`Login request prepared`);
      
      const response = await this.axiosInstance.post<ApiResponseData>(
        '/rest/auth/angelbroking/user/v1/loginByPassword',
        requestBody,
        {
          headers: this.getCommonHeaders()
        }
      );
      
      logger.info(`Login response received: ${response.data.status}`);
      
      if (response.data.status === true) {
        const tokens: AuthTokens = response.data.data;
        this.authTokens = tokens;
        this.setAuthToken(tokens.jwtToken);
        
        // Cache the tokens for later use
        cacheService.set('authTokens', tokens, 28 * 60 * 60); // Cache for 28 hours
        cacheService.set('clientCode', this.clientCode);
        
        logger.info(`Auth tokens cached successfully. JWT token received.`);
        
        return tokens;
      } else {
        throw new Error(response.data.message || 'Login failed');
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const data = error.response.data as Record<string, any>;
        logger.error(`Login API error: ${JSON.stringify(data)}`);
        throw new Error(`Login failed: ${data.message || error.message}`);
      }
      logger.error(`Login error: ${error}`);
      throw error;
    }
  }
  
  // Get user profile
  public async getProfile(): Promise<any> {
    try {
      logger.info('Attempting to get user profile');
      
      // Check if we have a valid token
      if (!this.authTokens?.jwtToken) {
        logger.error('No JWT token available for profile request');
        throw new Error('Authentication required. Please login first.');
      }
      
      const response = await this.axiosInstance.get<ApiResponseData>(
        '/rest/secure/angelbroking/user/v1/getProfile',
        {
          headers: {
            ...this.getCommonHeaders(),
            'Authorization': `Bearer ${this.authTokens?.jwtToken}`
          }
        }
      );
      
      logger.info(`Profile response status: ${response.data.status}`);
      
      if (response.data.status === true) {
        return response.data.data;
      } else {
        logger.error(`Failed to get profile: ${response.data.message || 'Unknown error'}`);
        throw new Error(response.data.message || 'Failed to get profile');
      }
    } catch (error) {
      logger.error(`Error in getProfile: ${error}`);
      if (axios.isAxiosError(error) && error.response) {
        const data = error.response.data as Record<string, any>;
        logger.error(`API Error: ${JSON.stringify(data)}`);
        throw new Error(`Failed to get profile: ${data.message || error.message}`);
      }
      throw error;
    }
  }
  
  // Get funds and margins
  public async getRMS(): Promise<any> {
    try {
      logger.info('Attempting to get RMS data');
      
      const response = await this.axiosInstance.get<ApiResponseData>(
        '/rest/secure/angelbroking/user/v1/getRMS',
        {
          headers: {
            ...this.getCommonHeaders(),
            'Authorization': `Bearer ${this.authTokens?.jwtToken}`
          }
        }
      );
      
      if (response.data.status === true) {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to get RMS data');
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const data = error.response.data as Record<string, any>;
        throw new Error(`Failed to get RMS data: ${data.message || error.message}`);
      }
      throw error;
    }
  }
  
  // Get historical data
  public async getHistoricalData(params: any): Promise<any> {
    try {
      logger.info(`Fetching historical data for ${params.symboltoken} from ${params.fromdate} to ${params.todate}`);
      
      const response = await this.axiosInstance.post<ApiResponseData>(
        '/rest/secure/angelbroking/historical/v1/getCandleData',
        params,
        {
          headers: {
            ...this.getCommonHeaders(),
            'Authorization': `Bearer ${this.authTokens?.jwtToken}`
          }
        }
      );
      
      if (response.data.status === true) {
        return response.data;
      } else {
        throw new Error(response.data.message || 'Failed to get historical data');
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const data = error.response.data as Record<string, any>;
        throw new Error(`Failed to get historical data: ${data.message || error.message}`);
      }
      throw error;
    }
  }
  
  // Get NIFTY options data
  public async getNiftyOptionsData(expiryISO: string): Promise<OptionChainData> {
  // 1️⃣  Read current spot
  const spotResp = await this.getMarketData({
    mode: 'FULL',
    exchangeTokens: { NSE: [NIFTY_TOKENS.NIFTY_INDEX.token] },
  });
  const spot = spotResp.fetched?.[0]?.ltp;
  if (!spot) throw new Error('Cannot fetch NIFTY spot');

  // 2️⃣  Decide strikes (ATM ±10 * 50 pts)
  const atm = Math.round(spot / 50) * 50;
  const strikes = Array.from({ length: 21 }, (_, i) => atm + (i - 10) * 50);

  // 3️⃣  Map strikes → tokens
  const master = await getScripMaster();
  const { ce, pe } = buildTokenMap(master, expiryISO, strikes);

  const tokenList = [...Object.values(ce), ...Object.values(pe)];
  if (tokenList.length === 0)
    throw new Error('No tokens found for requested expiry');

  // 4️⃣  Quote them in one call (≤ 50 tokens ≈ Angel limit)
  const quote = await this.getMarketData({
    mode: 'FULL',
    exchangeTokens: { NFO: tokenList },
  });

  // 5️⃣  Assemble OptionChainData
  const chain: OptionChainData = {
    expiry: expiryISO,
    spot,
    data: strikes.map((strike) => ({
      strike,
      ce: toOptionDTO(ce[strike]),
      pe: toOptionDTO(pe[strike]),
    })),
  };
  return chain;

  // Helper converts Angel quote line → our interface
  function toOptionDTO(token?: string): OptionData {
    const q = quote.fetched.find((x: any) => x.symbolToken === token);
    if (!q) return { oi: 0, volume: 0, ltp: 0, change: '0' };
    return {
      oi: q.opnInterest || 0,
      volume: q.tradeVolume || 0,
      ltp: q.ltp || 0,
      change: (q.percentChange || 0).toFixed(2),
    };
  }
}
  
  // Get market data quotes
  public async getMarketData(params: MarketDataParams): Promise<any> {
    try {
      logger.info(`Fetching market data with parameters: ${JSON.stringify(params)}`);
      
      const response = await this.axiosInstance.post<ApiResponseData>(
        '/rest/secure/angelbroking/market/v1/quote/',
        params,
        {
          headers: {
            ...this.getCommonHeaders(),
            'Authorization': `Bearer ${this.authTokens?.jwtToken}`
          }
        }
      );
      
      if (response.data.status === true) {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Failed to get market data');
      }
    } catch (error) {
      logger.error(`Market data error: ${error}`);
      throw error;
    }
  }
  
  // Generate new tokens
  public async refreshTokens(): Promise<AuthTokens> {
    if (!this.authTokens?.refreshToken) {
      throw new Error('No refresh token available');
    }
    
    try {
      logger.info('Attempting to refresh tokens');
      
      const response = await this.axiosInstance.post<ApiResponseData>(
        '/rest/auth/angelbroking/jwt/v1/generateTokens',
        {
          refreshToken: this.authTokens.refreshToken
        },
        {
          headers: this.getCommonHeaders()
        }
      );
      
      if (response.data.status === true) {
        const tokens: AuthTokens = response.data.data;
        this.authTokens = tokens;
        this.setAuthToken(tokens.jwtToken);
        
        // Cache the new tokens
        cacheService.set('authTokens', tokens, 28 * 60 * 60); // Cache for 28 hours
        
        logger.info('Tokens refreshed successfully');
        return tokens;
      } else {
        throw new Error(response.data.message || 'Token refresh failed');
      }
    } catch (error) {
      logger.error(`Token refresh error: ${error}`);
      if (axios.isAxiosError(error) && error.response) {
        const data = error.response.data as Record<string, any>;
        throw new Error(`Token refresh failed: ${data.message || error.message}`);
      }
      throw error;
    }
  }
  
  // Logout
  public async logout(): Promise<boolean> {
    try {
      logger.info('Attempting to logout');
      
      const response = await this.axiosInstance.post<ApiResponseData>(
        '/rest/secure/angelbroking/user/v1/logout',
        {
          clientcode: this.clientCode
        },
        {
          headers: {
            ...this.getCommonHeaders(),
            'Authorization': `Bearer ${this.authTokens?.jwtToken}`
          }
        }
      );
      
      if (response.data.status === true) {
        // Clear cached tokens
        cacheService.del('authTokens');
        cacheService.del('clientCode');
        this.authTokens = undefined;
        logger.info('Logout successful');
        return true;
      } else {
        throw new Error(response.data.message || 'Logout failed');
      }
    } catch (error) {
      logger.error(`Logout error: ${error}`);
      if (axios.isAxiosError(error) && error.response) {
        const data = error.response.data as Record<string, any>;
        throw new Error(`Logout failed: ${data.message || error.message}`);
      }
      throw error;
    }
  }
}

// Create a singleton instance that can be imported elsewhere
let apiService: AngelOneApiService | null = null;

export function initializeApiService(config: AngelOneApiConfig): AngelOneApiService {
  apiService = new AngelOneApiService(config);
  return apiService;
}

export function getApiService(): AngelOneApiService {
  if (!apiService) {
    throw new Error('API service not initialized. Call initializeApiService first.');
  }
  return apiService;
}