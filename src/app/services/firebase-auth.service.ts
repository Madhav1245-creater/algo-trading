import { Injectable, inject } from '@angular/core';
import { Auth, authState, signInWithPopup, GoogleAuthProvider, signOut, User, createUserWithEmailAndPassword, signInWithEmailAndPassword } from '@angular/fire/auth';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FirebaseAuthService {
  private auth = inject(Auth);
  
  // Observable to let components know if the user is authenticated
  public user$: Observable<User | null> = authState(this.auth);

  constructor() { }

  async signupWithEmail(email: string, pass: string): Promise<User | null> {
    try {
      const result = await createUserWithEmailAndPassword(this.auth, email, pass);
      return result.user;
    } catch (error) {
      console.error("Firebase Email Signup Error:", error);
      throw error;
    }
  }

  async loginWithEmail(email: string, pass: string): Promise<User | null> {
    try {
      const result = await signInWithEmailAndPassword(this.auth, email, pass);
      return result.user;
    } catch (error) {
      console.error("Firebase Email Login Error:", error);
      throw error;
    }
  }

  async loginWithGoogle(): Promise<User | null> {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.auth, provider);
      return result.user;
    } catch (error) {
      console.error("Firebase Google Login Error:", error);
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error) {
      console.error("Firebase Logout Error:", error);
    }
  }
}
