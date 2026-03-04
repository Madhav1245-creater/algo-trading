import { TestBed } from '@angular/core/testing';

import { UpstoxService } from './upstox.service';

describe('UpstoxService', () => {
  let service: UpstoxService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UpstoxService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
