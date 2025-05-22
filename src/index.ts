// Updated index.ts with proper socket.io initialization

import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import logger from './utils/logger';
import apiRoutes from './api/routes';
import authRoutes from './auth/routes';
import { initializeApiService, AngelOneApiConfig } from './services/apiService';
import { cacheService } from './services/cacheService';
import { initializeSocketServer } from './services/socketHandler';

// Load environment variables
dotenv.config();

// Initialize API service
const apiConfig: AngelOneApiConfig = {
  apiKey: process.env.ANGEL_API_KEY || '',
  clientCode: process.env.ANGEL_CLIENT_CODE || '',
  authTokens: cacheService.get('authTokens')
};

// Initialize the API service
const apiService = initializeApiService(apiConfig);

// Create Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO for real-time updates
const io = initializeSocketServer(server);

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false  // Disable CSP for development
}));
app.use(express.json());

// Serve static files from the public directory
app.use(express.static('public'));

// API routes
app.use('/api', apiRoutes);
app.use('/api', authRoutes);

// Basic route
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: './public' });
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile('dashboard.html', { root: './public' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'UP', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    socketConnections: io.engine.clientsCount || 0
  });
});

// Check if the dashboard HTML file exists
app.get('/check-dashboard-file', (req, res) => {
  const dashboardPath = path.join(__dirname, '../public/dashboard.html');
  if (fs.existsSync(dashboardPath)) {
    res.send(`Dashboard file exists at ${dashboardPath}`);
  } else {
    res.status(404).send(`Dashboard file not found at ${dashboardPath}`);
  }
});

// Set development environment if not specified
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
  logger.info('Environment not specified, defaulting to development mode');
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

export { app, server, io };