import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UpstoxService } from '../../../services/upstox.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss'
})
export class AccountComponent implements OnInit {
  isConnected: boolean = false;
  upstoxProfile: any = null;

  constructor(private upstoxService: UpstoxService) {}

  ngOnInit() {
    this.checkConnection();
  }

  checkConnection() {
    this.isConnected = this.upstoxService.isAuthenticated();
    if (this.isConnected) {
      this.fetchProfile();
    }
  }

  async fetchProfile() {
    try {
      const result = await this.upstoxService.getProfile();
      this.upstoxProfile = result.data; // Upstox wraps the actual profile inside a "data" object recursively
    } catch (error) {
      console.error('Failed to load Upstox profile:', error);
      // Try renewing token or redirecting to prompt re-login
      this.isConnected = false;
    }
  }

  connectUpstox() {
    this.upstoxService.login();
  }
}
