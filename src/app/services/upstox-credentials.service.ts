import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

export interface UpstoxCredentials {
  apiKey: string;
  apiSecret: string;
}

@Injectable({
  providedIn: 'root'
})
export class UpstoxCredentialsService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  private _cached: UpstoxCredentials | null = null;

  private getDocRef(uid: string) {
    return doc(this.firestore, `users/${uid}/settings/upstox`);
  }

  async saveCredentials(creds: UpstoxCredentials): Promise<void> {
    // Wait for Firebase auth to be fully initialised before accessing currentUser
    await (this.auth as any).authStateReady();
    const uid = this.auth.currentUser?.uid;
    if (!uid) throw new Error('User not logged in');
    await setDoc(this.getDocRef(uid), creds, { merge: true });
    this._cached = creds;
  }

  async loadCredentials(): Promise<UpstoxCredentials | null> {
    try {
      // CRITICAL: wait for Firebase to restore session from IndexedDB/cookie
      // before accessing auth.currentUser — otherwise uid is null after a redirect
      await (this.auth as any).authStateReady();
      const uid = this.auth.currentUser?.uid;
      if (!uid) {
        console.warn('[UpstoxCreds] No Firebase user yet — cannot load credentials.');
        return null;
      }
      const snap = await getDoc(this.getDocRef(uid));
      if (snap.exists()) {
        const creds = snap.data() as UpstoxCredentials;
        this._cached = creds;
        console.log('[UpstoxCreds] Loaded credentials from Firestore for uid:', uid);
        return creds;
      }
      console.warn('[UpstoxCreds] No credentials saved in Firestore yet.');
      return null;
    } catch (e) {
      console.error('[UpstoxCreds] Failed to load credentials:', e);
      return null;
    }
  }

  setCached(c: UpstoxCredentials) { this._cached = c; }
  getCached(): UpstoxCredentials | null { return this._cached; }
}
