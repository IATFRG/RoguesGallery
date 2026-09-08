ROGUE GALLERY DIRECTORY - FIREBASE FREE VERSION

This version uses:
- Firebase Authentication (Email/Password)
- Cloud Firestore for cloud profiles
- NO Firebase Storage

Profile pictures are resized/compressed in the browser and saved as small image data with the profile document.

SETUP:
1. Firebase Console -> Authentication -> Sign-in method -> enable Email/Password.
2. Firebase Console -> Firestore Database -> Rules.
3. Replace the rules with the contents of firestore.rules and Publish.
4. Upload ALL website files to your GitHub repository, including firebase-config.js.
5. GitHub Pages should serve from the repository root.

IMPORTANT LIMIT:
Cloud Firestore documents have a maximum size. This website automatically resizes images to a maximum of 512 pixels and compresses them. Very large or unusually complex images may be rejected; choose a smaller image if that happens.

CLOUD ACCESS:
Profiles are stored under the signed-in Firebase user's account. Sign in with the SAME email/password on another device to access the same profiles.

OPTIONAL:
Place logo.png in the same folder if you want your logo displayed on the login/register pages.
