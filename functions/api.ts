import dotenv from 'dotenv';
import serverless from 'serverless-http';

// Load environment variables
dotenv.config();

// Import the Express app
import { app } from '../dist/server.js';

// Wrap Express app with serverless-http
export const handler = serverless(app);

