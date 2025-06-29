import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.NODE_ENV === 'production' 
  ? process.env.MONGODB_URI_PROD 
  : process.env.MONGODB_URI;

class Database {
  constructor() {
    this.connection = null;
    this.connectionPromise = null;
  }

  async connect() {
    try {
      // If already connecting, return the existing promise
      if (this.connectionPromise) {
        return this.connectionPromise;
      }

      // If already connected, return the connection
      if (this.isConnected()) {
        return this.connection;
      }

      // Create new connection promise
      this.connectionPromise = mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000, // 5 second timeout
        socketTimeoutMS: 45000, // 45 second timeout
        bufferCommands: false, // Disable mongoose buffering
        bufferMaxEntries: 0, // Disable mongoose buffering
        maxPoolSize: 1, // Limit connection pool for serverless
        minPoolSize: 0, // Start with 0 connections
        maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      });

      this.connection = await this.connectionPromise;
      
      console.log('✅ Connected to MongoDB with Mongoose');
      
      // Create indexes for better performance
      await this.createIndexes();
      
      // Clear the promise after successful connection
      this.connectionPromise = null;

      return this.connection;
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      this.connectionPromise = null;
      throw error;
    }
  }

  async createIndexes() {
    try {
      // Mongoose will handle indexes through the schema definitions
      console.log('✅ Database indexes will be created by Mongoose schemas');
    } catch (error) {
      console.error('❌ Error creating indexes:', error);
    }
  }

  getConnection() {
    return this.connection;
  }

  isConnected() {
    return mongoose.connection.readyState === 1;
  }

  async close() {
    if (this.connection) {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    }
  }
}

export default new Database(); 