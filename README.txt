ROGUE GALLERY DIRECTORY - SECURE ADMIN CODE EDITION

WHAT THIS VERSION DOES
- Every account has an Officer Name, email and password.
- Regular Users can view all profiles, add profiles, and edit profiles they created.
- Editors can edit only profiles assigned to them by an Administrator.
- Administrators can manage roles, assign Editors, edit all profiles and delete profiles.
- The FIRST Administrator can be created using an Administrator Setup Code.

IMPORTANT SECURITY DESIGN
The Administrator Setup Code is NOT stored in GitHub Pages or public JavaScript.
It is stored as a Firebase Functions server secret.
The secure backend checks the code and promotes only the FIRST Administrator.
After the first Administrator exists, the code can no longer create another Administrator.

SETUP
1. Enable Firebase Authentication > Email/Password.
2. Create Firestore and publish firestore.rules.
3. Install Firebase CLI and log in.
4. From this project folder, initialize/deploy Functions if needed.
5. Set the secret:
   firebase functions:secrets:set ADMIN_SETUP_CODE
6. Enter a strong administrator code when prompted. Do NOT put this code in GitHub.
7. Deploy the backend:
   firebase deploy --only functions
8. Firebase will provide the function URL. Put that URL into admin-setup-config.js.
9. Commit and publish the website files to GitHub Pages.
10. Register the first account and enter the Administrator Setup Code.
11. Leave the code blank for ordinary accounts.

IMPORTANT PRICING NOTE
Secure Firebase Cloud Functions deployment may require the Blaze plan depending on Firebase's current account requirements. Check Firebase's current pricing before enabling billing.

FIRESTORE COLLECTIONS
/users/{uid}
/profiles/{profileId}

PHOTO STORAGE
No Firebase Storage is used. Profile photos are compressed and stored in Firestore, subject to Firestore document-size limits.
