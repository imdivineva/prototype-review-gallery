// Paste the config object from Firebase Console → Project settings → Your apps → SDK setup.
// This is safe to commit to a public repo: the web config is not a secret, access is
// controlled by the Firestore/Storage security rules, not by hiding these values.
// See README.md for the full setup steps.

export const firebaseConfig = {
  apiKey: "AIzaSyCwkXmSRS-NjsgylIHWCaoKDbrjt_3hSmA",
  authDomain: "prototype-review-gallery.firebaseapp.com",
  projectId: "prototype-review-gallery",
  storageBucket: "prototype-review-gallery.firebasestorage.app",
  messagingSenderId: "364647273283",
  appId: "1:364647273283:web:4cdce9e3d5e329992755f6"
};

// Shared access code for the password gate. This only hides the app from casual
// visitors — anyone who reads the page source can see it, so don't reuse a real
// password here. Change this to whatever you want to share with the client.
export const ACCESS_CODE = "obx-review";
