import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SeasonalityEngineService } from '../../../services/seasonality-engine.service';
import { UpstoxInstrument, SeasonalityResult, Candle } from '../../../models/backtest.models';
import { SECTOR_MAPPING, SECTORS } from '../../../data/sectors';

@Component({
  selector: 'app-seasonality',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './seasonality.component.html',
  styleUrl: './seasonality.component.scss'
})
export class SeasonalityComponent implements OnInit {

  isLoadingInstruments = true;
  errorMessage = '';

  // Instrument Selection
  sectors = SECTORS;
  selectedSector = '';
  allStocks: UpstoxInstrument[] = [];
  filteredStocks: UpstoxInstrument[] = [];
  selectedStocks: UpstoxInstrument[] = [];
  searchText = '';

  // Table Configuration
  tableView: 'day' | 'week' | 'month' = 'month';
  isCalculating = false;

  // Cache to store the massive daily payload so switching views is instant
  private cachedCandles = new Map<string, Candle[]>();

  // Results
  results: SeasonalityResult[] = [];

  // Dropdown UI states
  isSectorDropdownOpen = false;
  isPeriodDropdownOpen = false;

  // Click outside listener helper variables (not strictly needed with a backdrop, but good practice)

  constructor(private seasonalityEngine: SeasonalityEngineService) {}

  ngOnInit(): void {
    this.loadInstruments();
  }

  async loadInstruments() {
    this.isLoadingInstruments = true;
    try {
      this.allStocks = await this.seasonalityEngine.getEquityInstruments();
      
      if (this.allStocks.length === 0) {
          throw new Error("Failed to parse instrument list (0 stocks loaded). The Upstox CSV might not be decompressing properly via the Proxy or CORS.");
      }

      this.filteredStocks = this.allStocks.slice(0, 100);
    } catch (error: any) {
      this.errorMessage = error.message;
    } finally {
      this.isLoadingInstruments = false;
    }
  }

  onSearchChange() {
    if (!this.searchText) {
      this.filteredStocks = [];
      return;
    }
    
    const query = this.searchText.toLowerCase();
    const selectedKeys = new Set(this.selectedStocks.map(s => s.instrument_key));
    this.filteredStocks = this.allStocks
      .filter(stock => 
        !selectedKeys.has(stock.instrument_key) &&
        (stock.tradingsymbol.toLowerCase().includes(query) || 
         stock.name.toLowerCase().includes(query))
      )
      .slice(0, 100);

    console.log(this.filteredStocks, 'FILTERED STOCKS')
  }

  toggleSelection(stock: UpstoxInstrument) {
    const index = this.selectedStocks.findIndex(s => s.instrument_key === stock.instrument_key);
    if (index > -1) {
      this.selectedStocks.splice(index, 1);
      this.cachedCandles.delete(stock.instrument_key);
    } else {
      this.selectedStocks.push(stock);
      // Auto-close the dropdown after selection
      this.searchText = '';
      this.filteredStocks = [];
    }
  }

  isSelected(stock: UpstoxInstrument): boolean {
    return this.selectedStocks.some(s => s.instrument_key === stock.instrument_key);
  }

  removeSelected(stock: UpstoxInstrument) {
     this.selectedStocks = this.selectedStocks.filter(s => s.instrument_key !== stock.instrument_key);
     this.cachedCandles.delete(stock.instrument_key);
    // If user customizes a sector selection by removing a stock, convert it to a custom list
    if (this.selectedSector) {
      this.selectedSector = '';
    }
  }

  onSectorChange() {
    this.selectedStocks = [];
    if (!this.selectedSector) {
      return;
    }
    const symbols = SECTOR_MAPPING[this.selectedSector];

    // Auto-fetch all stocks for this sector
    const sectorStocks = this.allStocks.filter(s => symbols.includes(s.tradingsymbol));
    this.selectedStocks = sectorStocks;
  }

  selectSector(sector: string) {
    this.selectedSector = sector;
    this.isSectorDropdownOpen = false;
    this.onSectorChange();
  }

  selectPeriod(period: 'day' | 'week' | 'month') {
    this.tableView = period;
    this.isPeriodDropdownOpen = false;
    this.onViewChange();
  }

  closeDropdowns() {
    this.isSectorDropdownOpen = false;
    this.isPeriodDropdownOpen = false;
    this.searchText = '';
    this.filteredStocks = [];
  }

  /**
   * Fetches the data from the API and calculates the initial view
   */
  async generateAnalysis() {
    if (this.selectedStocks.length === 0) return;
    
    this.isCalculating = true;
    this.errorMessage = '';
    this.results = [];

    try {
      // Fetch sequentially to avoid rate limiting
      for (const stock of this.selectedStocks) {
           let candles = this.cachedCandles.get(stock.instrument_key);
           
           if (!candles) {
               console.log(`[Seasonality] Initiating deep fetch for MAX history of ${stock.tradingsymbol}...`);
               candles = await this.seasonalityEngine.fetchDeepHistoricalData(stock.instrument_key);
               
               if (!candles || candles.length === 0) {
                 console.warn(`Could not fetch data for ${stock.tradingsymbol}`);
                 continue;
               }
               // Save to memory so toggling view uses this instead of hitting API again
               this.cachedCandles.set(stock.instrument_key, candles);
           }
           
        const result = this.seasonalityEngine.calculateSeasonality(stock, candles, this.tableView);
        if (result) {
          this.results.push(result);
        }
      }

       console.log('[Seasonality] Complete analysis results:', this.results);
      
    } catch (error: any) {
       this.errorMessage = 'Analysis Failed: ' + error.message;
       console.error(error);
    } finally {
      this.isCalculating = false;
    }
  }

  /**
   * Instantly flips the UI view by recalculating from the cached Memory arrays
   */
  async onViewChange() {
      // If we haven't fetched anything yet, don't do anything
      if (this.cachedCandles.size === 0 || this.selectedStocks.length === 0) return;

      this.isCalculating = true;
      try {
          // No API calls here, just heavy synchronous math. We use a micro-timeout 
          // to let the UI render the spinner before blocking the main thread.
          setTimeout(() => {
              this.results = this.selectedStocks.map(stock => {
                  const candles = this.cachedCandles.get(stock.instrument_key)!;
                  return this.seasonalityEngine.calculateSeasonality(stock, candles, this.tableView);
              });
              this.isCalculating = false;
          }, 50);
      } catch (error) {
           console.error('Recalculation error:', error);
           this.isCalculating = false;
      }
  }

  getCellStyle(percent: number, startPrice: number): any {
     if (startPrice === 0) return { 'background-color': '#f9fafb', 'color': '#9ca3af' }; // bg-gray-50

     if (percent >= 15) return { 'background-color': '#16a34a', 'color': 'white', 'font-weight': 'bold' };
     if (percent >= 10) return { 'background-color': '#22c55e', 'color': 'white', 'font-weight': 'bold' };
     if (percent >= 5)  return { 'background-color': '#86efac', 'color': '#14532d', 'font-weight': '600' };
     if (percent > 0)   return { 'background-color': '#dcfce3', 'color': '#166534' };
     
     if (percent <= -15) return { 'background-color': '#dc2626', 'color': 'white', 'font-weight': 'bold' };
     if (percent <= -10) return { 'background-color': '#ef4444', 'color': 'white', 'font-weight': 'bold' };
     if (percent <= -5)  return { 'background-color': '#fca5a5', 'color': '#7f1d1d', 'font-weight': '600' };
     if (percent < 0)    return { 'background-color': '#fee2e2', 'color': '#991b1b' };

     return { 'background-color': '#f3f4f6', 'color': '#4b5563' }; 
  }
}
