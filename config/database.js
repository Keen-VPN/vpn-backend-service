import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.NODE_ENV === 'production' 
  ? process.env.MONGODB_URI_PROD 
  : process.env.MONGODB_URI;

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      // Connect to MongoDB using Mongoose
      this.connection = await mongoose.connect(MONGODB_URI);
      
      console.log('✅ Connected to MongoDB with Mongoose');
      
      // Create indexes for better performance
      await this.createIndexes();
      
      return this.connection;
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
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