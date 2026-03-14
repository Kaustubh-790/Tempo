import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

const adminServiceAccount = JSON.parse(
  process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT,
);

const firebaseAdmin = admin.initializeApp(
  {
    credential: admin.credential.cert(adminServiceAccount),
  },
  "firebase-admin",
);

export default firebaseAdmin;
