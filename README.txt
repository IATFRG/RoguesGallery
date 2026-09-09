ROGUE GALLERY DIRECTORY — ROLES & OFFICER NAME VERSION

This version uses Firebase Authentication + Cloud Firestore only. Firebase Storage is not required.

IMPORTANT: FIRST ADMINISTRATOR SETUP

The secret administrator setup code is NOT placed in the GitHub source code.
Instead, create it once inside Firestore:

1. Firebase Console → Firestore Database → Data.
2. Create collection: system
3. Create document ID: bootstrap
4. Add field: code (string) = choose a long secret code yourself.
5. Add field: enabled (boolean) = true.
6. Publish the included firestore.rules BEFORE registering the first administrator.

Then register the first account using:
- Officer Name
- Email
- Password
- The same secret administrator setup code

The registration uses an atomic Firestore batch to create the account as Administrator and set enabled to false. The web app cannot read the bootstrap document because the rules deny access.

DO NOT put the setup code inside app.js, HTML, GitHub, or any public file.

PERMISSIONS
- User: View all profiles, add profiles, edit only profiles they created.
- Editor: View all profiles, add profiles, edit profiles specifically assigned by an Administrator, plus profiles they created.
- Administrator: View/add/edit/delete all profiles, manage account roles, assign Editors to individual profiles.

AFTER FIRST ADMIN IS CREATED
- Sign in as the Administrator.
- Use Manage Users to promote selected accounts to Editor.
- On a profile card, use Permissions to choose which Editors can edit that profile.

FIRESTORE RULES
Copy the contents of firestore.rules into Firebase → Firestore Database → Rules and publish them.

IMPORTANT SECURITY NOTE
Firebase web configuration values identify the web app; authorization is enforced by Firebase Authentication and Firestore Security Rules. Keep the administrator setup code private.

MOBILE / PWA
------------
This version is mobile-ready and installable as a Progressive Web App (PWA).
On a supported phone browser, open the GitHub Pages site and use the browser's
Install/Add to Home Screen option. On supported browsers the dashboard header
also exposes an Install App button.

The app uses the same Firebase Authentication and Firestore backend as the
website. No Firebase Storage is required.

For a store-distributed Android/iOS build, this web app can later be wrapped
with Capacitor without changing the Firebase data model.
