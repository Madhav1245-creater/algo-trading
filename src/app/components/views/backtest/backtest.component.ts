import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarketDataService } from '../../../services/market-data.service';
import { BacktestRunnerService } from '../../../services/backtest-runner.service';
import { BacktestConfig, BacktestResult, TimeInterval } from '../../../models/backtest.models';

@Component({
  selector: 'app-backtest',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './backtest.component.html',
  styleUrl: './backtest.component.scss'
})
export class BacktestComponent implements OnInit {

  // Form Models
  instrumentKey = 'NSE_EQ|INE002A01018'; // Default: Reliance Ind
  interval: TimeInterval = 'day';
  fromDate: string = this.getDefaultFromDate();
  toDate: string = this.getDefaultToDate();
  initialCapital = 100000;
  strategyId = 'MACross';
  
  // State
  isLoading = false;
  errorMessage = '';
  
  // Results
  lastResult: BacktestResult | null = null;

  constructor(
    private marketData: MarketDataService,
    private backtestRunner: BacktestRunnerService
  ) {}

  ngOnInit(): void {}

  async runBacktest() {
    this.isLoading = true;
    this.errorMessage = '';
    this.lastResult = null;

    try {
      // 1. Construct the Config
      const config: BacktestConfig = {
        initialCapital: this.initialCapital,
        instrumentKey: this.instrumentKey,
        interval: this.interval,
        fromDate: new Date(this.fromDate),
        toDate: new Date(this.toDate),
        strategyId: this.strategyId,
        strategyParams: { shortWindow: 9, longWindow: 21 }, // Hardcoded for MACross right now
        brokeragePerOrder: 20, // Example 20 rupees per trade
        slippagePercent: 0.05 // Example slippage 0.05%
      };

      // 2. Fetch the Engine Data
      const candles = await this.marketData.getHistoricalData({
        instrumentKey: config.instrumentKey,
        interval: config.interval,
        fromDate: config.fromDate,
        toDate: config.toDate
      });

      if (candles.length === 0) {
        throw new Error("No data returned for the selected date range.");
      }

      // 3. Process the Data
      this.lastResult = this.backtestRunner.runBacktest(config, candles);

    } catch (error: any) {
      console.error(error);
      this.errorMessage = error.message || 'Failed to run backtest. Check console or verify your Upstox connection.';
    } finally {
      this.isLoading = false;
    }
  }

  // --- Date format helpers (YYYY-MM-DD for native input date) ---
  private getDefaultFromDate(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 6); // default to 6 months ago
    return d.toISOString().split('T')[0];
  }

  private getDefaultToDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
