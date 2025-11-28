# Firebase Storage CORS Fix

## Issue
CORS error when uploading files to Firebase Storage from localhost.

## Solution

### Option 1: Deploy Storage Rules (Recommended)

1. **Deploy the storage rules:**
   ```bash
   firebase deploy --only storage
   ```

2. **Verify in Firebase Console:**
   - Go to Firebase Console → Storage → Rules
   - Ensure rules are deployed

### Option 2: Temporary Fix for Development

If you haven't set up Firebase CLI yet:

1. **Go to Firebase Console:**
   - Navigate to: https://console.firebase.google.com/project/chesterfield-taxi-1461f/storage
   - Click on "Rules" tab

2. **Paste these rules:**
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /applications/{applicationId}/{allPaths=**} {
         allow write: if request.resource.size < 5 * 1024 * 1024;
         allow read, delete: if request.auth != null;
       }
       match /{allPaths=**} {
         allow read, write: if false;
       }
     }
   }
   ```

3. **Click "Publish"**

### Explanation

The CORS error occurs because:
1. Firebase Storage has restrictive default rules
2. Uploads are blocked by default
3. Localhost origins need explicit permission

The rules we created:
- ✅ Allow public uploads to `applications/{id}/` folder
- ✅ Limit file size to 5MB
- ✅ Require authentication for reading (admins only)
- ✅ Deny all other access

### Verification

After deploying rules, test the careers form again. The upload should work without CORS errors.
