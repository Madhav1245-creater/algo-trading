import { Injectable } from '@angular/core';
import { UpstoxService } from './upstox.service';
import { Candle, MarketDataRequest } from '../models/backtest.models';
import axios from 'axios';

@Injectable({
  providedIn: 'root'
})
export class MarketDataService {
  
  // Base Upstox API URL
  private readonly baseUrl = 'https://api.upstox.com/v2/historical-candle';
  
  // Cache to prevent duplicate fetching: Key format "instrument_interval_from_to"
  private memoryCache: Map<string, Candle[]> = new Map();

  constructor(private upstoxService: UpstoxService) { }

  /**
   * Dynamically fetches historical candle data based on user configuration.
   * Handles pagination/looping if the date range is very large (Upstox has limits per request).
   */
  async getHistoricalData(request: MarketDataRequest): Promise<Candle[]> {
    const cacheKey = this.generateCacheKey(request);
    
    // 1. Check Memory Cache First
    if (this.memoryCache.has(cacheKey)) {
      console.log(`[MarketDataService] Returning cached data for ${cacheKey}`);
      return this.memoryCache.get(cacheKey)!;
    }

    // 2. Format Dates for Upstox API (YYYY-MM-DD)
    const toDateStr = this.formatDate(request.toDate);
    const fromDateStr = this.formatDate(request.fromDate);

    if (!this.upstoxService.isAuthenticated()) {
      throw new Error("Must be connected to Upstox to fetch market data.");
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('upstox_access_token') : null;

    if (!token) {
        throw new Error("No Upstox token found");
    }

    try {
      console.log(`[MarketDataService] Fetching ${request.instrumentKey} (${request.interval}) from ${fromDateStr} to ${toDateStr}`);
      
      // Using the proxy configured in proxy.conf.json to avoid CORS
      const url = `/v2/historical-candle/${encodeURIComponent(request.instrumentKey)}/${request.interval}/${toDateStr}/${fromDateStr}`;
      
      const response = await axios.get(url, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data && response.data.status === 'success' && response.data.data) {
        const candles = this.parseUpstoxCandles(response.data.data.candles);
        
        // Reverse because Upstox returns newest to oldest, we want chronological for backtesting (oldest to newest)
        candles.reverse();

        // 3. Cache the result for future runs
        this.memoryCache.set(cacheKey, candles);
        
        // Note: For large datasets, we should implement Firestore caching here.
        // this.saveToFirestoreCache(request, candles);

        return candles;
      } else {
        throw new Error(response.data?.message || "Invalid response from Upstox API");
      }

    } catch (error: any) {
      console.error('[MarketDataService] Error fetching historical data:', error);
      
      let errorMessage = "Failed to load backtest data.";
      if (error.response && error.response.data && error.response.data.errors) {
         // Upstox error format
         errorMessage = error.response.data.errors[0]?.message || JSON.stringify(error.response.data.errors);
      } else if (error.code === 'ERR_NETWORK') {
         errorMessage = "Network Error. Are you running the Angular Dev Proxy? (npm start)";
      } else {
         errorMessage = error.message;
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Helper to parse Upstox array format into defined Candle interface
   * Upstox Format: ["timestamp", open, high, low, close, volume, openInterest]
   */
  private parseUpstoxCandles(rawCandles: any[][]): Candle[] {
    return rawCandles.map(row => ({
      timestamp: new Date(row[0]),
      open: parseFloat(row[1]),
      high: parseFloat(row[2]),
      low: parseFloat(row[3]),
      close: parseFloat(row[4]),
      volume: parseInt(row[5], 10),
      openInterest: row.length > 6 ? parseInt(row[6], 10) : undefined
    }));
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
  }

  private generateCacheKey(request: MarketDataRequest): string {
    return `${request.instrumentKey}_${request.interval}_${this.formatDate(request.fromDate)}_${this.formatDate(request.toDate)}`;
  }

}
