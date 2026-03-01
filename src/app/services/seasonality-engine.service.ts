import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UpstoxInstrument, Candle, SeasonalityResult, SeasonalityYearData, SeasonalityDataPoint, SeasonalityPeriodMetrics } from '../models/backtest.models';
import axios from 'axios';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SeasonalityEngineService {

  private readonly INSTRUMENT_CSV_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz';
  
  // Cache the full list so we don't re-download the massive CSV on every component load
  private allInstruments: UpstoxInstrument[] = [];

  constructor(private http: HttpClient) { }

  /**
   * Fetches the maximum available daily data for a given instrument.
   * Bypasses the 1-year Upstox limit by making multiple sequential calls backwards in time until Upstox returns empty.
   */
  async fetchDeepHistoricalData(instrumentKey: string): Promise<Candle[]> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('upstox_access_token') : null;
    if (!token) throw new Error("No Upstox token found. Please connect Broker Account.");

    let allCandles: Candle[] = [];
    
    // We start from today
    let currentEndDate = new Date();
    
    // Since we don't know the exact IPO/Listing date for every stock, we just loop backwards until we hit a wall.
    // We put a hardcap of 50 years to prevent infinite loops in case of API bugs.
    const MAX_YEARS_SAFEGUARD = 50; 
    
    for (let i = 0; i < MAX_YEARS_SAFEGUARD; i++) {
        // Calculate the start date for this 1-year chunk (strictly 1 year to avoid Upstox limits)
        let currentStartDate = new Date(currentEndDate);
        currentStartDate.setFullYear(currentStartDate.getFullYear() - 1);

        const toDateStr = this.formatDate(currentEndDate);
        const fromDateStr = this.formatDate(currentStartDate);

        try {
            console.log(`[SeasonalityEngine] Fetching ${instrumentKey} Chunk ${i+1}: ${fromDateStr} to ${toDateStr}`);
            
            const url = `/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${toDateStr}/${fromDateStr}`;
            const response = await axios.get(url, {
              headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
              }
            });

            if (response.data && response.data.status === 'success' && response.data.data) {
                const chunkData = response.data.data.candles;
                
                if (!chunkData || chunkData.length === 0) {
                     console.log(`[SeasonalityEngine] Hit the start of data history before ${toDateStr}. Total years fetched: ${i}`);
                     break; // Stock probably didn't exist before this (IPO date reached)
                }

                const parsedChunk = this.parseUpstoxCandles(chunkData);
                allCandles = allCandles.concat(parsedChunk);

                // Set the end date for the NEXT loop to be 1 day before the start date of THIS loop
                currentEndDate = new Date(currentStartDate);
                currentEndDate.setDate(currentEndDate.getDate() - 1);
            } else {
                 console.error('[SeasonalityEngine] API Error in chunk:', response.data);
                 break;
            }

        } catch (error: any) {
             console.error(`[SeasonalityEngine] Error fetching chunk ${i}:`, error.message);
             // If we hit an error (e.g. rate limits or 404 for too old), stop fetching but return what we have so far
             break; 
        }
    }

    // Upstox returns newest to oldest within each chunk, and our chunks are newest to oldest.
    // So the entire array is newest-to-oldest. We reverse it so it's chronological (oldest to newest)
    allCandles.reverse();
    return allCandles;
  }

  // ... (formatDate, calculateSeasonality, parseUpstoxCandles remain unchanged)

  private formatDate(date: Date): string {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;

    return [year, month, day].join('-');
  }

  /**
   * Calculates the percentage change for each Month or Week across multiple years.
   * Assumes 'candles' is sorted chronologically (oldest to newest).
   */
  calculateSeasonality(instrument: UpstoxInstrument, candles: Candle[], period: 'month' | 'week'): SeasonalityResult {
     
     // Map to group data by Year
     // Inside each year, map to group data by Period (Month Index 0-11, or Week Number 1-52)
     const yearlyGroups = new Map<number, Map<number, Candle[]>>();

     for (const candle of candles) {
         const year = candle.timestamp.getFullYear();
         
         let periodKey: number;
         if (period === 'month') {
             periodKey = candle.timestamp.getMonth(); // 0-11
         } else {
             // Calculate ISO Week number (1-53)
             const tempDate = new Date(candle.timestamp.getTime());
             tempDate.setHours(0, 0, 0, 0);
             tempDate.setDate(tempDate.getDate() + 3 - (tempDate.getDay() + 6) % 7);
             const week1 = new Date(tempDate.getFullYear(), 0, 4);
             periodKey = 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
         }

         if (!yearlyGroups.has(year)) {
             yearlyGroups.set(year, new Map());
         }

         const periodsForYear = yearlyGroups.get(year)!;
         if (!periodsForYear.has(periodKey)) {
             periodsForYear.set(periodKey, []);
         }

         periodsForYear.get(periodKey)!.push(candle);
     }

     const resultYears: SeasonalityYearData[] = [];

     const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

     // Iterate over each year to calculate the percentage difference between the first open and last close of each period
     for (const [year, periodsMap] of Array.from(yearlyGroups.entries()).sort((a, b) => a[0] - b[0])) {
         
         const dataPoints: SeasonalityDataPoint[] = [];
         
         // Fix the number of periods (12 months or 52 weeks) so the UI grid is uniform
         const maxPeriods = period === 'month' ? 12 : 52;
         
         for (let p = 0; p < maxPeriods; p++) {
             // For weeks, the key is 1-indexed. For months, it's 0-indexed.
             const lookupKey = period === 'week' ? p + 1 : p;
             const periodCandles = periodsMap.get(lookupKey);
             
             let label = '';
             if (period === 'month') {
                 label = monthNames[p];
             } else {
                 // For weeks (1-52), calculate which month it roughly falls into (every ~4.3 weeks is a month)
                 // A simple heuristic is: MonthIndex = Math.floor((p) / 4.33)
                 const approximateMonthIndex = Math.min(11, Math.floor(p / 4.33));
                 label = `${monthNames[approximateMonthIndex]} W${p + 1}`;
             }

             if (!periodCandles || periodCandles.length === 0) {
                 // No trading data for this period (e.g. holidays or stock didn't exist yet)
                 dataPoints.push({
                     periodLabel: label,
                     startPrice: 0,
                     endPrice: 0,
                     percentageChange: 0 
                     // Alternatively, we could use undefined, but 0 is easier for math unless we want to render "N/A"
                     // In the UI we will check if startPrice === 0 to render an empty cell.
                 });
             } else {
                  // CLOSE-TO-CLOSE (industry standard - matches MoneyControl/Chartink):
                  // % change = (this period last close - prev period last close) / prev period last close
                  const sorted = periodCandles.slice().sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                  const endPrice = sorted[sorted.length - 1].close;

                  // Find previous period closing price
                  let prevClose = 0;
                  if (p === 0) {
                      const prevYearMap = yearlyGroups.get(year - 1);
                      if (prevYearMap) {
                          const prevPeriodKey = period === 'week' ? 52 : 11;
                          const prevCandles = prevYearMap.get(prevPeriodKey);
                          if (prevCandles && prevCandles.length > 0) {
                              const ps = prevCandles.slice().sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                              prevClose = ps[ps.length - 1].close;
                          }
                      }
                  } else {
                      const prevKey = period === 'week' ? p : p - 1;
                      const prevCandles = periodsMap.get(prevKey);
                      if (prevCandles && prevCandles.length > 0) {
                          const ps = prevCandles.slice().sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
                          prevClose = ps[ps.length - 1].close;
                      }
                  }

                  if (prevClose === 0) {
                      dataPoints.push({ periodLabel: label, startPrice: 0, endPrice: 0, percentageChange: 0 });
                  } else {
                      const pctChange = ((endPrice - prevClose) / prevClose) * 100;
                      dataPoints.push({ periodLabel: label, startPrice: prevClose, endPrice: endPrice, percentageChange: pctChange });
                  }
              }
         }

         resultYears.push({
             year: year,
             dataPoints: dataPoints
         });
     }

     // Now calculate the aggregated Period Metrics (Avg, Win %, Loss %) for the columns
     const periodMetrics: SeasonalityPeriodMetrics[] = [];
     const maxPeriods = period === 'month' ? 12 : 52;
     
     for (let p = 0; p < maxPeriods; p++) {
         let sumPercentage = 0;
         let positiveCount = 0;
         let negativeCount = 0;
         let validYearsCount = 0;

         // Grab the label from the first year's pre-computed dataPoints (already has the correct label string)
         const label = resultYears[0]?.dataPoints[p]?.periodLabel ?? '';
         
         // Extract vertical column data across all years
         for (const yearObj of resultYears) {
             const dp = yearObj.dataPoints[p];
             if (dp.startPrice > 0) {
                 validYearsCount++;
                 sumPercentage += dp.percentageChange;
                 if (dp.percentageChange >= 0) positiveCount++;
                 if (dp.percentageChange < 0) negativeCount++;
             }
         }

         const avgReturn = validYearsCount > 0 ? (sumPercentage / validYearsCount) : 0;
         const winRate = validYearsCount > 0 ? (positiveCount / validYearsCount) * 100 : 0;
         const lossRate = validYearsCount > 0 ? (negativeCount / validYearsCount) * 100 : 0;

         periodMetrics.push({
             periodLabel: label,
             averageReturn: avgReturn,
             positiveProbability: winRate,
             negativeProbability: lossRate
         });
     }

     return {
         instrument: instrument,
         yearsData: resultYears,
         periodMetrics: periodMetrics
     };
  }

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

  /**
   * Fetches the massive CSV from Upstox using Angular HttpClient.
   * Downloads the .gz file as a Blob and uses the browser's native DecompressionStream to unpack it in-memory.
   */
  async getEquityInstruments(): Promise<UpstoxInstrument[]> {
    if (this.allInstruments.length > 0) {
      return this.allInstruments;
    }

    try {
      console.log('[SeasonalityEngine] Downloading Upstox Master Instrument List via HttpClient...');
      
        // Use the dev proxy on localhost (avoids CORS); use the direct CDN URL in production.
        // The Upstox CDN (assets.upstox.com) serves this file with public CORS headers.
        const isLocal = window.location.hostname === 'localhost';
        const csvUrl = isLocal
            ? '/upstox-assets/market-quote/instruments/exchange/complete.csv.gz'
            : 'https://assets.upstox.com/market-quote/instruments/exchange/complete.csv.gz';

        console.log('[SeasonalityEngine] Fetching instruments from:', csvUrl);
      
      // 1. Fetch as a Blob using Angular HttpClient
        const gzipBlob = await firstValueFrom(this.http.get(csvUrl, { responseType: 'blob' }));
      
      if (!gzipBlob) {
          throw new Error('Received empty data from Upstox.');
      }
      
      console.log('[SeasonalityEngine] Downloaded .gz Blob. Starting native decompression...');

      // 2. Native browser decompression stream
      const decompressedStream = gzipBlob.stream().pipeThrough(new DecompressionStream('gzip'));
      const textResponse = new Response(decompressedStream);
      const csvData = await textResponse.text();
      
      // 3. Parse CSV — get all rows first
      const allParsed = this.parseCsv(csvData);

      if (allParsed.length === 0) {
        throw new Error('CSV parsed 0 rows — decompression may have failed.');
      }

      const EQUITY_EXCHANGES = new Set(['NSE_EQ']);

      let equityStocks = allParsed.filter(inst => {
        return EQUITY_EXCHANGES.has(inst.exchange)
      });

      this.allInstruments = equityStocks;
      return equityStocks;

    } catch (error) {
       console.error('[SeasonalityEngine] Failed to fetch instruments:', error);
       throw new Error('Failed to load Upstox instrument list. Try hard-refreshing your browser.');
    }
  }

  /**
   * A lightweight, custom CSV parser to handle the Upstox format without pulling in heavy npm dependencies.
   */
  private parseCsv(csvText: string): UpstoxInstrument[] {
      console.log(`[SeasonalityEngine] CSV Text Length: ${csvText?.length || 0}`);
      
      const lines = csvText.split('\n');
      console.log(`[SeasonalityEngine] Total Lines Parsed: ${lines.length}`);
      
      if (lines.length === 0 || lines.length === 1) { // 1 line probably means it didn't gunzip or is malformed
         return [];
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      console.log(`[SeasonalityEngine] CSV Headers:`, headers);

      const instruments: UpstoxInstrument[] = [];

      // Start from 1 to skip headers
      for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Robust regex to split by comma, ignoring commas inside double quotes
          const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
          
          if (values.length === headers.length) {
              const inst: any = {};
              headers.forEach((header, index) => {
                  inst[header] = values[index];
              });
              instruments.push(inst as UpstoxInstrument);
          }
      }

      console.log(`[SeasonalityEngine] Successfully converted ${instruments.length} lines to objects.`);
      return instruments;
  }
}
