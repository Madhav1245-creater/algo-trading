import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription, filter } from 'rxjs';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { UpstoxService } from '../../../services/upstox.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, CommonModule],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent implements OnInit, OnDestroy {
  isConnected = false;
  showBanner = false;          // Hide on /account page (it's already self-explaining there)
  private sub = new Subscription();

  constructor(private upstoxService: UpstoxService, private router: Router) { }

  ngOnInit() {
    // Track connection state
    this.sub.add(
      this.upstoxService.isConnected$.subscribe(val => {
        this.isConnected = val;
      })
    );
    // Hide the banner when the user is on the account page itself
    this.sub.add(
      this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
        this.showBanner = !e.urlAfterRedirects.includes('/account');
      })
    );
    // Set initial value
    this.showBanner = !this.router.url.includes('/account');
  }

  goToAccount() {
    this.router.navigate(['/account']);
  }

  ngOnDestroy() { this.sub.unsubscribe(); }
}
