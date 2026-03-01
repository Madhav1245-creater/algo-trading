import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UpstoxService } from '../../services/upstox.service';
import { UpstoxCredentialsService } from '../../services/upstox-credentials.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss'
})
export class AuthComponent implements OnInit {
  isLoading = true;
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private upstoxService: UpstoxService,
    private credentialsService: UpstoxCredentialsService
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(async (params) => {
      const code = params['code'];

      if (code) {
        this.isLoading = true;

        // CRITICAL: Load credentials from Firestore FIRST so the token exchange
        // uses the user-saved API key/secret, not the environment fallback.
        try {
          const creds = await this.credentialsService.loadCredentials();
          if (creds) {
            this.credentialsService.setCached(creds);
            console.log('[Auth] Loaded credentials from Firestore for token exchange.');
          } else {
            console.warn('[Auth] No saved credentials found in Firestore — using environment fallback.');
          }
        } catch (e) {
          console.warn('[Auth] Could not load credentials from Firestore:', e);
        }

        const success = await this.upstoxService.handleAuthCallback(code);

        if (success) {
          this.router.navigate(['/']);
        } else {
          this.errorMessage = 'Failed to authenticate with Upstox. Please verify your API Key, API Secret, and that the Redirect URL in your Upstox app exactly matches the one shown in the Account page.';
          this.isLoading = false;
        }
      } else {
        // No code — user navigated here manually; start the OAuth flow
        this.upstoxService.login();
      }
    });
  }

  retry(): void {
    this.errorMessage = '';
    this.isLoading = true;
    this.upstoxService.login();
  }
}
