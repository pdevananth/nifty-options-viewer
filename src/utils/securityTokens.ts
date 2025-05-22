// src/utils/securityTokens.ts
// Reference file for Angel One security tokens

export interface SecurityToken {
  exchange: string;
  tradingSymbol: string;
  token: string;
  lotSize?: number;
  tickSize?: number;
}

export const NIFTY_TOKENS = {
  // NIFTY 50 Index on NSE
  NIFTY_INDEX: {
    exchange: "NSE",
    tradingSymbol: "NIFTY",
    token: "26000", // This is the common token for NIFTY 50 Index
    tickSize: 0.05
  },
  
  // NIFTY 50 Futures - Current Month
  NIFTY_FUTURES_CURRENT: {
    exchange: "NFO",
    tradingSymbol: "NIFTY25MAYFUT", // Update this as per current expiry
    token: "26009", // This token may change with expiry
    lotSize: 50,
    tickSize: 0.05
  },
  
  // Example format for NIFTY options
  // These need to be generated dynamically based on strike prices and expiry
  NIFTY_CE_22000_MAY: {
    exchange: "NFO",
    tradingSymbol: "NIFTY25MAY22000CE",
    token: "43619", // This is an example token
    lotSize: 50,
    tickSize: 0.05
  },
  
  NIFTY_PE_22000_MAY: {
    exchange: "NFO",
    tradingSymbol: "NIFTY25MAY22000PE",
    token: "43620", // This is an example token
    lotSize: 50,
    tickSize: 0.05
  }
};

// Function to generate a token lookup for NIFTY options
export function generateNiftyOptionsTokens(
  expiry: string, // Format: "DDMMMYY" e.g., "25MAY23"
  baseStrike: number, // ATM strike price
  range: number // Number of strikes above and below ATM
): Record<string, SecurityToken> {
  const tokens: Record<string, SecurityToken> = {};
  
  // In a real implementation, you would call Angel One API to get the actual tokens
  // This is just a placeholder to demonstrate the concept
  
  for (let i = -range; i <= range; i++) {
    const strike = baseStrike + (i * 100); // NIFTY options typically have 100-point intervals
    
    // Create CE token
    const ceSymbol = `NIFTY${expiry}${strike}CE`;
    tokens[ceSymbol] = {
      exchange: "NFO",
      tradingSymbol: ceSymbol,
      token: `CE${strike}`, // Placeholder - real implementation would use actual tokens
      lotSize: 50,
      tickSize: 0.05
    };
    
    // Create PE token
    const peSymbol = `NIFTY${expiry}${strike}PE`;
    tokens[peSymbol] = {
      exchange: "NFO",
      tradingSymbol: peSymbol,
      token: `PE${strike}`, // Placeholder - real implementation would use actual tokens
      lotSize: 50,
      tickSize: 0.05
    };
  }
  
  return tokens;
}

// Function to search for a symbol token
export async function searchSymbolToken(apiService: any, exchange: string, searchTerm: string): Promise<SecurityToken[]> {
  try {
    // Use the searchScrip method to find tokens
    const searchParams = {
      exchange: exchange,
      searchscrip: searchTerm
    };
    
    const results = await apiService.searchScrip(searchParams);
    
    if (results && Array.isArray(results)) {
      return results.map(item => ({
        exchange: item.exchange,
        tradingSymbol: item.tradingsymbol,
        token: item.symboltoken
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error searching for symbol token:', error);
    return [];
  }
}