// Updated socketHandler.ts with no mock data fallback

import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server } from 'http';
import logger from '../utils/logger';
import { getApiService } from './apiService';
import { NIFTY_TOKENS } from '../utils/securityTokens';

interface ClientInfo {
  id: string;
  lastActive: number;
  subscribedTokens: Set<string>;
}

interface SubscriptionData {
  symbols: string[];
}

interface OptionsRequestData {
  expiry: string;
}

// Map to store active client connections
const clients = new Map<string, ClientInfo>();

// Initialize Socket.IO server
export function initializeSocketServer(server: Server): SocketIOServer {
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000 // 25 seconds
  });
  
  logger.info('Socket.IO server initialized');
  
  // Handle new connections
  io.on('connection', (socket: Socket) => {
    const clientId = socket.id;
    logger.info(`Client connected: ${clientId}`);
    
    // Store client info
    clients.set(clientId, {
      id: clientId,
      lastActive: Date.now(),
      subscribedTokens: new Set()
    });
    
    // Send welcome message
    socket.emit('welcome', { 
      message: 'Connected to NIFTY Options Viewer',
      clientId,
      serverTime: new Date().toISOString()
    });
    
    // Set up event handlers for client requests
    setupEventHandlers(socket);
    
    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${clientId}`);
      clients.delete(clientId);
    });
  });
  
  // Start periodic market data updates
  startMarketDataUpdates(io);
  
  return io;
}

// Set up event handlers for client requests
function setupEventHandlers(socket: Socket): void {
  const clientId = socket.id;
  
  // Handle market data requests
  socket.on('get_market_data', async () => {
    try {
      const data = await fetchMarketData();
      socket.emit('market_update', data);
    } catch (error) {
      logger.error(`Error fetching market data for client ${clientId}:`, error);
      socket.emit('error', { message: 'Failed to fetch market data' });
    }
  });
  
  // Handle options data requests
  socket.on('get_options_data', async (data: OptionsRequestData) => {
    try {
      const { expiry } = data;
      if (!expiry) {
        socket.emit('error', { message: 'Expiry date is required' });
        return;
      }
      
      const optionsData = await fetchOptionsData(expiry);
      socket.emit('options_data', optionsData);
    } catch (error) {
      logger.error(`Error fetching options data for client ${clientId}:`, error);
      socket.emit('error', { message: 'Failed to fetch options data' });
    }
  });
  
  // Subscription to specific symbols
  socket.on('subscribe', (data: SubscriptionData) => {
    try {
      const { symbols } = data;
      if (!symbols || !Array.isArray(symbols)) {
        socket.emit('error', { message: 'Invalid symbols list' });
        return;
      }
      
      // Add symbols to client's subscription list
      const client = clients.get(clientId);
      if (client) {
        symbols.forEach(symbol => client.subscribedTokens.add(symbol));
        logger.info(`Client ${clientId} subscribed to symbols: ${symbols.join(', ')}`);
        socket.emit('subscription_success', { symbols });
      }
    } catch (error) {
      logger.error(`Error processing subscription for client ${clientId}:`, error);
      socket.emit('error', { message: 'Failed to process subscription' });
    }
  });
  
  // Unsubscribe from specific symbols
  socket.on('unsubscribe', (data: SubscriptionData) => {
    try {
      const { symbols } = data;
      if (!symbols || !Array.isArray(symbols)) {
        socket.emit('error', { message: 'Invalid symbols list' });
        return;
      }
      
      // Remove symbols from client's subscription list
      const client = clients.get(clientId);
      if (client) {
        symbols.forEach(symbol => client.subscribedTokens.delete(symbol));
        logger.info(`Client ${clientId} unsubscribed from symbols: ${symbols.join(', ')}`);
        socket.emit('unsubscription_success', { symbols });
      }
    } catch (error) {
      logger.error(`Error processing unsubscription for client ${clientId}:`, error);
      socket.emit('error', { message: 'Failed to process unsubscription' });
    }
  });
  
  // Ping/pong for keep-alive
  socket.on('ping', () => {
    // Update last active timestamp
    const client = clients.get(clientId);
    if (client) {
      client.lastActive = Date.now();
    }
    socket.emit('pong', { timestamp: Date.now() });
  });
}

// Start periodic market data updates
function startMarketDataUpdates(io: SocketIOServer): void {
  // Update market data every 5 seconds
  setInterval(async () => {
    try {
      if (clients.size === 0) return; // No clients connected
      
      const data = await fetchMarketData();
      io.emit('market_update', data);
      
    } catch (error) {
      logger.error('Error in market data update:', error);
    }
  }, 5000);
}

// Fetch market data
async function fetchMarketData(): Promise<any> {
  try {
    const apiService = getApiService();
    
    // Get NIFTY spot data
    const niftySpotData = await apiService.getMarketData({
      mode: "FULL",
      exchangeTokens: {
        "NSE": [NIFTY_TOKENS.NIFTY_INDEX.token] // NIFTY 50 token
      }
    });
    
    // Get NIFTY futures data
    const niftyFutureData = await apiService.getMarketData({
      mode: "FULL",
      exchangeTokens: {
        "NFO": [NIFTY_TOKENS.NIFTY_FUTURES_CURRENT.token] // NIFTY futures token
      }
    });
    
    // Process the data
    return {
      niftySpot: niftySpotData.fetched?.[0]?.ltp || 0,
      niftyChange: niftySpotData.fetched?.[0]?.percentChange || 0,
      niftyFuture: niftyFutureData.fetched?.[0]?.ltp || 0,
      pcrRatio: calculatePCRRatio(), // Placeholder function
      ivIndex: calculateIVIndex(),    // Placeholder function
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Failed to fetch market data:', error);
    throw error;
  }
}

// Fetch options data for a specific expiry
async function fetchOptionsData(expiry: string): Promise<any> {
  try {
    const apiService = getApiService();
    const optionsData = await apiService.getNiftyOptionsData(expiry);
    return { status: true, data: optionsData };
  } catch (error) {
    logger.error('Failed to fetch options data:', error);
    throw error;
  }
}

// Calculate Put-Call Ratio (placeholder function)
function calculatePCRRatio(): number {
  // In a real implementation, this would calculate the PCR based on
  // actual OI data from options chain
  // For now, return a fixed value
  return 1.0;
}

// Calculate Implied Volatility Index (placeholder function)
function calculateIVIndex(): number {
  // In a real implementation, this would calculate the IV index based on
  // option prices and the Black-Scholes model
  // For now, return a fixed value
  return 16.5;
}

export default {
  initializeSocketServer
};