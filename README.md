# Review Gallery

A small static app for uploading prototype screenshots and letting a client (or
anyone with the access code) view them, like/dislike, and leave comments.
Built for reviewing OBX Field Guide drafts, but works for any project — pick or
create a project from the dropdown.

Plain HTML/CSS/JS, no build step. Project/comment/like data lives in Firebase
Firestore (free, no credit card needed) and images are hosted on Cloudinary's
free tier (also no credit card needed — Firebase Storage now requires a
billing-enabled Blaze plan, so this avoids that). The frontend can be hosted
anywhere static, including GitHub Pages.

## How it works

- A shared access code gates the app (client-side only — see "Security notes"
  below).
- Everyone who enters the code can upload screenshots, like/dislike, and
  comment. There's no separate admin/viewer role.
- Screenshots are grouped by "project" (e.g. "OBX Field Guide"). Use the
  `+ Project` button to add more later.

## One-time setup

### 1. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/) and create a
   new project (the free "Spark" plan is enough — no card required).
2. In **Firestore Database**, click "Create database", **Standard** edition,
   **production mode**, pick any region.
3. In **Authentication → Sign-in method**, enable **Anonymous** sign-in.
   (This just gives each browser a stable anonymous ID so we can track one
   like/dislike per person — no real accounts involved.)
4. In **Project settings → General → Your apps**, click the `</>` (web) icon
   to register a web app. Copy the `firebaseConfig` object it gives you.

Images are hosted on Cloudinary instead of Firebase Storage, since Firebase
now requires a billing-enabled plan for Storage. Cloudinary's free tier
(25GB) needs no card:

5. Create a free account at [cloudinary.com](https://cloudinary.com/).
6. Your **Cloud name** is shown on the dashboard right after signup — copy it.
7. Go to **Settings (gear icon) → Upload → Upload presets → Add upload preset**.
8. Set **Signing Mode** to **Unsigned** (this lets the browser upload directly
   with no backend/API secret involved). Save, and copy the preset name.

### 2. Configure the app

Open `firebase-config.js` and paste in the values from step 1.4, and set your
own `ACCESS_CODE`:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};

export const ACCESS_CODE = "whatever-you-want-to-share-with-the-client";
```

Open `cloudinary-config.js` and paste in your cloud name and preset name from
steps 6 and 8:

```js
export const CLOUDINARY_CLOUD_NAME = "your-cloud-name";
export const CLOUDINARY_UPLOAD_PRESET = "your-preset-name";
```

### 3. Set security rules

**Firestore rules** (Firestore Database → Rules):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      allow read: if true;
      allow create: if request.auth != null;
    }
    match /screenshots/{screenshotId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update: if request.auth != null
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes', 'dislikes']);

      match /comments/{commentId} {
        allow read: if true;
        allow create: if request.auth != null;
      }
      match /reactions/{uid} {
        allow read: if request.auth != null;
        allow write: if request.auth != null && request.auth.uid == uid;
      }
    }
  }
}
```

Publish the rule set after pasting it in. (There's no Storage rules step —
images go to Cloudinary, not Firebase Storage; access to the unsigned upload
preset is controlled by whether someone knows the preset name, same trust
model as the access code.)

### 4. Try it locally

Open `index.html` with a local static server (opening the file directly with
`file://` will break the ES module imports). For example, from this folder:

```
npx serve .
```

Enter your access code, create a project, and upload a test screenshot.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repository (can be public — the Firebase web
   config here is not a secret; access is controlled by the security rules
   above, not by hiding these values).
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source: Deploy from a branch**, branch
   `main`, folder `/ (root)` (or `/Review Gallery` if this folder lives
   inside a larger repo — GitHub Pages needs it at the repo root, or use a
   dedicated repo for this app).
4. Save. GitHub will give you a URL like
   `https://<username>.github.io/<repo>/` within a minute or two.
5. Share that URL and the access code with the client.

## Security notes (read before sharing externally)

- The access code is a UI gate, not real authentication — it's visible to
  anyone who views the page source. It's meant to keep casual/drive-by
  visitors out, not to protect sensitive data. Don't upload anything
  confidential.
- Anyone with the code can upload, react, and comment — there's no separate
  admin role. That matches what was asked for (one shared code for everyone).
- The `likes`/`dislikes` counters are updated by the client directly; the
  Firestore rules only check that an update touches just those two fields,
  not that the math is correct. Good enough for an internal review tool; not
  suitable if this ever needs to resist a motivated bad actor.
- The Cloudinary upload preset is "unsigned," meaning anyone who knows the
  preset name (visible in this app's source) can upload images through it.
  Same trust model as the access code — fine for an internal review tool,
  not for anything you need to lock down tightly.

## Data model (Firestore)

- `projects/{id}` — `{ name, createdAt }`
- `screenshots/{id}` — `{ projectId, group, imageUrl, cloudinaryPublicId, caption, likes, dislikes, uploadedAt }`
- `screenshots/{id}/comments/{id}` — `{ text, author, createdAt }`
- `screenshots/{id}/reactions/{uid}` — `{ type: "like" | "dislike", updatedAt }`
