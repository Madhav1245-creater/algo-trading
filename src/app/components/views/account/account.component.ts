import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UpstoxService } from '../../../services/upstox.service';
import { UpstoxCredentialsService } from '../../../services/upstox-credentials.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss'
})
export class AccountComponent implements OnInit {
  isConnected = false;
  upstoxProfile: any = null;
  isLoadingProfile = false;

  // Credentials form
  apiKey = '';
  apiSecret = '';
  isSaving = false;
  saveSuccess = false;
  saveError = '';
  credentialsLoaded = false;
  hasCredentials = false;

  // Redirect URI to show user
  redirectUri = '';
  redirectCopied = false;

  constructor(
    private upstoxService: UpstoxService,
    private credentialsService: UpstoxCredentialsService
  ) { }

  async ngOnInit() {
    this.redirectUri = this.upstoxService.getRedirectUri();
    await this.loadCredentials();
    this.checkConnection();
  }

  async loadCredentials() {
    const creds = await this.credentialsService.loadCredentials();
    if (creds) {
      this.apiKey = creds.apiKey;
      this.apiSecret = creds.apiSecret;
      this.credentialsService.setCached(creds); // populate runtime cache
      this.hasCredentials = true;
    }
    this.credentialsLoaded = true;
  }

  checkConnection() {
    this.isConnected = this.upstoxService.isAuthenticated();
    if (this.isConnected) {
      this.isLoadingProfile = true;
      this.fetchProfile();
    }
  }

  async fetchProfile() {
    try {
      const result = await this.upstoxService.getProfile();
      this.upstoxProfile = result.data;
    } catch {
      this.isConnected = false;
    } finally {
      this.isLoadingProfile = false;
    }
  }

  async saveCredentials() {
    if (!this.apiKey.trim() || !this.apiSecret.trim()) {
      this.saveError = 'Both API Key and API Secret are required.';
      return;
    }
    this.isSaving = true;
    this.saveError = '';
    this.saveSuccess = false;
    try {
      const creds = { apiKey: this.apiKey.trim(), apiSecret: this.apiSecret.trim() };
      await this.credentialsService.saveCredentials(creds);
      this.credentialsService.setCached(creds);
      this.hasCredentials = true;
      this.saveSuccess = true;
      setTimeout(() => this.saveSuccess = false, 3000);
    } catch (e: any) {
      this.saveError = e.message || 'Failed to save credentials.';
    } finally {
      this.isSaving = false;
    }
  }

  connectUpstox() {
    this.upstoxService.login();
  }

  disconnectUpstox() {
    this.upstoxService.logout();
    this.isConnected = false;
    this.upstoxProfile = null;
  }

  copyRedirectUri() {
    navigator.clipboard.writeText(this.redirectUri).then(() => {
      this.redirectCopied = true;
      setTimeout(() => this.redirectCopied = false, 2000);
    });
  }

  get secretMasked(): string {
    if (!this.apiSecret) return '';
    return this.apiSecret.slice(0, 3) + '•'.repeat(Math.max(0, this.apiSecret.length - 3));
  }
}
