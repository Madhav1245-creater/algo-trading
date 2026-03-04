import { Injectable } from '@angular/core';
import { 
  BacktestConfig, 
  Candle, 
  TradePosition, 
  BacktestMetrics, 
  BacktestResult, 
  TradeSignal
} from '../models/backtest.models';
import { StrategyLogicService } from './strategy.service';

@Injectable({
  providedIn: 'root'
})
export class BacktestRunnerService {

  constructor(private strategyService: StrategyLogicService) { }

  /**
   * Core Engine Loop. Simulates the passage of time over historical data.
   */
  public runBacktest(config: BacktestConfig, marketData: Candle[]): BacktestResult {
    
    console.log(`[BacktestRunner] Starting simulation with ${marketData.length} candles.`);

    let currentCapital = config.initialCapital;
    let equityCurve: { time: Date, equity: number }[] = [];
    let tradeHistory: TradePosition[] = [];
    
    // State of the current open trade (assuming strategy only holds 1 position at a time for simplicity)
    let openPosition: TradePosition | null = null;
    let maxEquity = currentCapital;
    let maxDrawdownValue = 0;

    // We start from the beginning of the array. Over time, 'history' grows.
    for (let i = 0; i < marketData.length; i++) {
        const currentCandle = marketData[i];
        const historicalSlice = marketData.slice(0, i + 1);

        // 1. Evaluate Strategy for the current candle
        let signal: TradeSignal = { type: 'HOLD', price: 0, reason: '' };
        
        if (config.strategyId === 'MACross') {
           signal = this.strategyService.evaluateMovingAverageCrossover(
             currentCandle, 
             historicalSlice, 
             config.strategyParams || { shortWindow: 9, longWindow: 21 }
           );
        }

        // 2. Execute Trading Logic based on Signal
        if (signal.type === 'BUY' && !openPosition) {
           // Execute Buy Order (Enter Long)
           const executionPrice = this.applySlippage(currentCandle.close, 'BUY', config.slippagePercent);
           const cost = config.brokeragePerOrder || 0;
           
           // Calculate how many shares we can buy
           const quantity = Math.floor((currentCapital - cost) / executionPrice);
           
           if (quantity > 0) {
              const investment = (quantity * executionPrice) + cost;
              currentCapital -= investment;
              
              openPosition = {
                  entryTime: currentCandle.timestamp,
                  entryPrice: executionPrice,
                  type: 'LONG',
                  quantity: quantity,
                  status: 'OPEN'
              };
           }
        } 
        else if (signal.type === 'SELL' && openPosition && openPosition.type === 'LONG') {
           // Execute Sell Order (Close Long)
           const executionPrice = this.applySlippage(currentCandle.close, 'SELL', config.slippagePercent);
           const cost = config.brokeragePerOrder || 0;
           
           const revenue = (openPosition.quantity * executionPrice) - cost;
           currentCapital += revenue;
           
           // Calculate Trade P&L
           const totalCost = (openPosition.quantity * openPosition.entryPrice); // Ignoring entry brokerage here for simplicity of P&L display
           const tradePnl = revenue - totalCost;

           openPosition.exitTime = currentCandle.timestamp;
           openPosition.exitPrice = executionPrice;
           openPosition.status = 'CLOSED';
           openPosition.pnl = tradePnl;
           
           tradeHistory.push({ ...openPosition });
           openPosition = null;
        }

        // 3. Mark to Market (Calculate daily equity for the curve and drawdown)
        let currentEquity = currentCapital;
        if (openPosition) {
            currentEquity += (openPosition.quantity * currentCandle.close);
        }
        
        equityCurve.push({ time: currentCandle.timestamp, equity: currentEquity });

        // Update Max Drawdown tracker
        if (currentEquity > maxEquity) {
            maxEquity = currentEquity;
        }
        const drawdown = maxEquity - currentEquity;
        if (drawdown > maxDrawdownValue) {
            maxDrawdownValue = drawdown;
        }
    }

    // Force close any open positions at the very end of the backtest
    if (openPosition) {
        const lastCandle = marketData[marketData.length - 1];
        const executionPrice = lastCandle.close; // No slippage on forced exit
        const revenue = (openPosition.quantity * executionPrice) - (config.brokeragePerOrder || 0);
        currentCapital += revenue;
        
        const totalCost = (openPosition.quantity * openPosition.entryPrice);
        openPosition.exitTime = lastCandle.timestamp;
        openPosition.exitPrice = executionPrice;
        openPosition.status = 'CLOSED';
        openPosition.pnl = revenue - totalCost;
        tradeHistory.push({ ...openPosition });
    }

    // Calculate Final Metrics
    const winningTrades = tradeHistory.filter(t => t.pnl && t.pnl > 0);
    const losingTrades = tradeHistory.filter(t => t.pnl && t.pnl <= 0);
    
    const grossProfit = winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = losingTrades.reduce((sum, t) => sum + Math.abs(t.pnl || 0), 0);

    const metrics: BacktestMetrics = {
        totalTrades: tradeHistory.length,
        winningTrades: winningTrades.length,
        losingTrades: losingTrades.length,
        winRate: tradeHistory.length > 0 ? (winningTrades.length / tradeHistory.length) * 100 : 0,
        grossProfit,
        grossLoss,
        netProfit: currentCapital - config.initialCapital,
        maxDrawdown: maxDrawdownValue,
        maxDrawdownPercent: (maxDrawdownValue / config.initialCapital) * 100, // Roughly speaking
        finalCapital: currentCapital
    };

    console.log('[BacktestRunner] Simulation Complete.', metrics);

    return {
        config,
        metrics,
        trades: tradeHistory,
        equityCurve
    };
  }

  /**
   * Helper to simulate market slippage
   */
  private applySlippage(price: number, action: 'BUY' | 'SELL', slippagePercent: number = 0): number {
    if (slippagePercent === 0) return price;
    
    const slippageAmount = price * (slippagePercent / 100);
    // Slippage means you pay MORE when buying, and receive LESS when selling
    if (action === 'BUY') {
        return price + slippageAmount;
    } else {
        return price - slippageAmount;
    }
  }

}
