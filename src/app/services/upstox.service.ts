import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import axios from 'axios';

@Injectable({
  providedIn: 'root'
})
export class UpstoxService {

  private readonly API_BASE = 'https://api.upstox.com/v2';
  private accessToken: string | null = null;

  constructor() {
    // Try to load token from local storage if returning
    this.accessToken = localStorage.getItem('upstox_access_token');
  }

  // 1. Redirect user to Upstox Login Page
  public login(): void {
    const clientId = environment.upstox.apiKey;
    const redirectUri = environment.upstox.redirectUri;
    const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
    
    window.location.href = authUrl;
  }

  // 2. Handle the redirect back from Upstox with the 'code'
  public async handleAuthCallback(code: string): Promise<boolean> {
    try {
      const data = new URLSearchParams({
        code: code,
        client_id: environment.upstox.apiKey,
        client_secret: environment.upstox.apiSecret,
        redirect_uri: environment.upstox.redirectUri,
        grant_type: 'authorization_code'
      });

      const response = await axios.post(`${this.API_BASE}/login/authorization/token`, data, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      this.accessToken = response.data.access_token;
      if (this.accessToken) {
        localStorage.setItem('upstox_access_token', this.accessToken);
        return true;
      }
      return false;
      
    } catch (error) {
      console.error('Error authenticating with Upstox', error);
      return false;
    }
  }

  // Helper method to make authenticated API Calls
  public async getProfile(): Promise<any> {
    if (!this.accessToken) throw new Error("Not logged in to Upstox");
    
    try {
      const response = await axios.get(`${this.API_BASE}/user/profile`, {
        headers: {
          'Api-Version': '2.0',
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch Upstox profile", error);
      throw error;
    }
  }

  public isLoggedIn(): boolean {
    return !!this.accessToken;
  }

  public isAuthenticated(): boolean {
    return this.isLoggedIn();
  }
}
