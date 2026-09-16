import admin from 'firebase-admin';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load the JSON service account
const serviceAccount = require('../firebase_secret.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export default admin;
