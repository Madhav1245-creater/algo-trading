import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { UpstoxService } from '../../services/upstox.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  activeStrategies = 0;
  totalTrades = 0;
  winRate = 0;
  isConnected = false;
  private sub = new Subscription();

  constructor(private upstoxService: UpstoxService) { }

  ngOnInit(): void {
    this.sub.add(
      this.upstoxService.isConnected$.subscribe(v => this.isConnected = v)
    );
  }

  ngOnDestroy() { this.sub.unsubscribe(); }
}
