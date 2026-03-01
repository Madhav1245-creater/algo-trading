import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { UpstoxService } from '../../services/upstox.service';
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
    private upstoxService: UpstoxService
  ) {}

  ngOnInit(): void {
    // Check if we are returning from Upstox with a code
    this.route.queryParams.subscribe(async (params) => {
      const code = params['code'];
      
      if (code) {
        this.isLoading = true;
        const success = await this.upstoxService.handleAuthCallback(code);
        
        if (success) {
          // Successfully logged in, redirect to dashboard (we will create this next)
          this.router.navigate(['/']); 
        } else {
          this.errorMessage = 'Failed to authenticate with Upstox. Please check your API keys.';
          this.isLoading = false;
        }
      } else {
        // No code, user just navigated here manually. Let's redirect them to Upstox login
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
