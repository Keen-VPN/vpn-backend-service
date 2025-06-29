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
    this.isConnecting = false;
  }

  async connect() {
    try {
      // If already connected, return immediately
      if (this.isConnected()) {
        console.log('✅ Using existing MongoDB connection');
        return this.connection;
      }

      // If already connecting, wait for the existing promise
      if (this.isConnecting && this.connectionPromise) {
        console.log('⏳ Waiting for existing connection...');
        return await this.connectionPromise;
      }

      // Start new connection
      this.isConnecting = true;
      console.log('🔄 Connecting to MongoDB...');

      this.connectionPromise = mongoose.connect(MONGODB_URI, {
        // Connection timeouts
        serverSelectionTimeoutMS: 3000, // 3 second timeout for server selection
        socketTimeoutMS: 30000, // 30 second timeout for operations
        connectTimeoutMS: 10000, // 10 second timeout for initial connection

        // Connection pooling for serverless
        maxPoolSize: 1, // Single connection for serverless
        minPoolSize: 0, // Start with 0 connections
        maxIdleTimeMS: 60000, // Keep connection alive for 1 minute

        // Buffer settings
        bufferCommands: false, // Disable mongoose buffering
        bufferMaxEntries: 0, // Disable mongoose buffering

        // Retry settings
        retryWrites: true,
        retryReads: true,

        // Compression
        compressors: ['zlib'],

        // SSL settings
        ssl: true,
        sslValidate: true,

        // Heartbeat
        heartbeatFrequencyMS: 10000, // 10 second heartbeat
      });

      this.connection = await this.connectionPromise;
      
      console.log('✅ Connected to MongoDB with Mongoose');
      
      // Set up connection event handlers
      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
        this.resetConnection();
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
        this.resetConnection();
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
      });

      // Create indexes for better performance
      await this.createIndexes();
      
      // Reset connection state
      this.isConnecting = false;
      this.connectionPromise = null;

      return this.connection;
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      this.resetConnection();
      throw error;
    }
  }

  resetConnection() {
    this.connection = null;
    this.connectionPromise = null;
    this.isConnecting = false;
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
      this.resetConnection();
    }
  }

  // Health check method
  async healthCheck() {
    try {
      if (!this.isConnected()) {
        return { status: 'disconnected', readyState: mongoose.connection.readyState };
      }

      // Simple ping to check if connection is alive
      await mongoose.connection.db.admin().ping();
      return { status: 'healthy', readyState: mongoose.connection.readyState };
    } catch (error) {
      console.error('❌ Database health check failed:', error);
      return { status: 'unhealthy', error: error.message, readyState: mongoose.connection.readyState };
    }
  }
}

export default new Database(); 