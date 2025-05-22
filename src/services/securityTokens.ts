// Updated securityTokens.ts with more comprehensive NIFTY token definitions

export interface SecurityToken {
  exchange: string;
  tradingSymbol: string;
  token: string;
  lotSize?: number;
  tickSize?: number;
}

// Current market data as of May 2025
export const NIFTY_TOKENS = {
  // NIFTY 50 Index on NSE
  NIFTY_INDEX: {
    exchange: "NSE",
    tradingSymbol: "NIFTY",
    token: "26000", // This is the common token for NIFTY 50 Index
    tickSize: 0.05
  },
  
  // NIFTY Bank Index
  NIFTY_BANK_INDEX: {
    exchange: "NSE",
    tradingSymbol: "BANKNIFTY",
    token: "26009", // Bank NIFTY index token
    tickSize: 0.1
  },
  
  // NIFTY 50 Futures - Current Month (May 2025)
  NIFTY_FUTURES_CURRENT: {
    exchange: "NFO",
    tradingSymbol: "NIFTY25MAYFUT", 
    token: "56789", // This token may change with expiry
    lotSize: 75, // Updated lot size as of 2025
    tickSize: 0.05
  },
  
  // NIFTY 50 Futures - Next Month (June 2025)
  NIFTY_FUTURES_NEXT: {
    exchange: "NFO",
    tradingSymbol: "NIFTY25JUNFUT", 
    token: "56790", 
    lotSize: 75,
    tickSize: 0.05
  },
  
  // NIFTY 50 Futures - Far Month (July 2025)
  NIFTY_FUTURES_FAR: {
    exchange: "NFO",
    tradingSymbol: "NIFTY25JULFUT", 
    token: "56791", 
    lotSize: 75,
    tickSize: 0.05
  },
  
  // INDIA VIX Index
  INDIA_VIX: {
    exchange: "NSE",
    tradingSymbol: "INDIAVIX",
    token: "26017", 
    tickSize: 0.05
  }
};

// Sample ATM options for NIFTY (will need to be updated based on current prices)
export const NIFTY_SAMPLE_OPTIONS = {
  // Sample ATM Call Option
  NIFTY_CE_25000_MAY: {
    exchange: "NFO",
    tradingSymbol: "NIFTY25MAY25000CE",
    token: "67300", 
    lotSize: 75,
    tickSize: 0.05
  },
  
  // Sample ATM Put Option
  NIFTY_PE_25000_MAY: {
    exchange: "NFO",
    tradingSymbol: "NIFTY25MAY25000PE",
    token: "67301", 
    lotSize: 75,
    tickSize: 0.05
  }
};

// Function to generate a token lookup for NIFTY options
export function generateNiftyOptionsTokens(
  expiry: string, // Format: "DDMMMYY" e.g., "25MAY25"
  baseStrike: number, // ATM strike price
  range: number // Number of strikes above and below ATM
): Record<string, SecurityToken> {
  const tokens: Record<string, SecurityToken> = {};
  
  // In a real implementation, you would call Angel One API to get the actual tokens
  // This is a placeholder to demonstrate the concept
  
  for (let i = -range; i <= range; i++) {
    const strike = baseStrike + (i * 50); // NIFTY options typically have 50-point intervals
    
    // Create CE token
    const ceSymbol = `NIFTY${expiry}${strike}CE`;
    tokens[ceSymbol] = {
      exchange: "NFO",
      tradingSymbol: ceSymbol,
      token: `CE${strike}`, // Placeholder - real implementation would use actual tokens
      lotSize: 75,
      tickSize: 0.05
    };
    
    // Create PE token
    const peSymbol = `NIFTY${expiry}${strike}PE`;
    tokens[peSymbol] = {
      exchange: "NFO",
      tradingSymbol: peSymbol,
      token: `PE${strike}`, // Placeholder - real implementation would use actual tokens
      lotSize: 75,
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

// Function to get the expiry dates for NIFTY
export function getNiftyExpiryDates(): { value: string, display: string }[] {
  const today = new Date();
  const expiryDates = [];
  
  // Find upcoming Thursdays
  for (let i = 0; i < 4; i++) {
    const date = new Date(today);
    // Find the next Thursday
    date.setDate(date.getDate() + ((4 + 7 - date.getDay()) % 7) + (i * 7));
    
    // Format date as YYYY-MM-DD for value
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
  
  return expiryDates;
}

// Function to find ATM strike
export function findAtmStrike(spotPrice: number): number {
  // Round to nearest 50
  return Math.round(spotPrice / 50) * 50;
}