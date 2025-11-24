import dotenv from "dotenv";
import { Resend } from "resend";

// Ensure environment variables are loaded
dotenv.config();

// Skip Resend initialization in test environment (tests will mock it)
let resend: Resend;
if (process.env.NODE_ENV === "test") {
  // Create a mock Resend instance for tests
  resend = new Resend("test-api-key");
} else {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required");
  }
  resend = new Resend(process.env.RESEND_API_KEY);
}

export default resend;
