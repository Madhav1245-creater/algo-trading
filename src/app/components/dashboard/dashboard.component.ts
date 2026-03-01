import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {

  // Dashboard stats placeholder
  activeStrategies = 0;
  totalTrades = 0;
  winRate = 0;

  constructor() {}

  ngOnInit(): void {
    // We will load real dashboard metrics here later
  }
}
