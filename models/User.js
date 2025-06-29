import mongoose from 'mongoose';
import { getAuth } from 'firebase-admin/auth';

const userSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    index: true
  },
  displayName: String,
  photoURL: String,
  name: String, // For backward compatibility
  stripeCustomerId: {
    type: String,
    index: true
  },
  // Legacy fields for backward compatibility
  isSubscribed: {
    type: Boolean,
    default: false
  },
  subscriptionStatus: {
    type: String,
    default: 'none'
  },
  currentPlan: String,
  stripeSubscriptionId: String,
  subscriptionStartDate: Date,
  subscriptionEndDate: Date,
  // New subscription structure
  subscription: {
    status: {
      type: String,
      enum: ['none', 'active', 'past_due', 'cancelled', 'unpaid'],
      default: 'none'
    },
    planId: String,
    subscriptionId: String,
    startDate: Date,
    endDate: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamps on save
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static methods
userSchema.statics.createOrUpdateUser = async function(firebaseUser) {
  try {
    const userData = {
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName || null,
      photoURL: firebaseUser.photoURL || null,
      name: firebaseUser.displayName || firebaseUser.name || null, // For backward compatibility
      updatedAt: new Date()
    };

    const user = await this.findOneAndUpdate(
      { firebaseUid: firebaseUser.uid },
      userData,
      { 
        new: true, 
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    return user;
  } catch (error) {
    console.error('Error creating/updating user:', error);
    throw error;
  }
};

userSchema.statics.getUserByFirebaseUid = async function(firebaseUid) {
  try {
    return await this.findOne({ firebaseUid });
  } catch (error) {
    console.error('Error getting user by Firebase UID:', error);
    throw error;
  }
};

userSchema.statics.getUserByEmail = async function(email) {
  try {
    return await this.findOne({ email });
  } catch (error) {
    console.error('Error getting user by email:', error);
    throw error;
  }
};

userSchema.statics.getUserByStripeCustomerId = async function(customerId) {
  try {
    return await this.findOne({ stripeCustomerId: customerId });
  } catch (error) {
    console.error('Error getting user by Stripe customer ID:', error);
    throw error;
  }
};

userSchema.statics.updateSubscriptionStatus = async function(firebaseUid, subscriptionData) {
  try {
    const updateData = {
      subscription: {
        status: subscriptionData.status,
        planId: subscriptionData.planId,
        subscriptionId: subscriptionData.subscriptionId,
        startDate: subscriptionData.startDate,
        endDate: subscriptionData.endDate
      },
      // Legacy fields for backward compatibility
      isSubscribed: subscriptionData.status === 'active',
      subscriptionStatus: subscriptionData.status,
      currentPlan: subscriptionData.planId,
      stripeSubscriptionId: subscriptionData.subscriptionId,
      subscriptionStartDate: subscriptionData.startDate,
      subscriptionEndDate: subscriptionData.endDate,
      updatedAt: new Date()
    };

    // Update Stripe customer ID if provided
    if (subscriptionData.customerId) {
      updateData.stripeCustomerId = subscriptionData.customerId;
    }

    const user = await this.findOneAndUpdate(
      { firebaseUid },
      updateData,
      { new: true }
    );

    return user;
  } catch (error) {
    console.error('Error updating subscription status:', error);
    throw error;
  }
};

userSchema.statics.hasActiveSubscription = async function(firebaseUid) {
  try {
    const user = await this.findOne({ firebaseUid });
    if (!user) return false;

    // Check if subscription is active (new structure)
    if (user.subscription && user.subscription.status === 'active') {
      return true;
    }
    
    // Fallback to legacy structure
    return user.isSubscribed === true && user.subscriptionStatus === 'active';
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
};

userSchema.statics.shouldAllowSubscriptionUpdate = async function(firebaseUid, newStatus) {
  try {
    const user = await this.findOne({ firebaseUid });
    if (!user) return true; // Allow update if user doesn't exist

    // If user has an active subscription, only allow updates to 'active' status
    const hasActive = await this.hasActiveSubscription(firebaseUid);
    
    if (hasActive && newStatus !== 'active') {
      console.log(`Blocking subscription update for user ${firebaseUid}: current=active, new=${newStatus}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking if subscription update should be allowed:', error);
    return false; // Block update on error to be safe
  }
};

userSchema.statics.getSubscriptionDetails = async function(firebaseUid) {
  try {
    const user = await this.findOne({ firebaseUid });
    if (!user) {
      return {
        status: 'none',
        planId: null,
        subscriptionId: null,
        startDate: null,
        endDate: null
      };
    }

    // Use new structure if available
    if (user.subscription) {
      return {
        status: user.subscription.status,
        planId: user.subscription.planId,
        subscriptionId: user.subscription.subscriptionId,
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate
      };
    }

    // Fallback to legacy structure
    return {
      status: user.subscriptionStatus || 'none',
      planId: user.currentPlan,
      subscriptionId: user.stripeSubscriptionId,
      startDate: user.subscriptionStartDate,
      endDate: user.subscriptionEndDate
    };
  } catch (error) {
    console.error('Error getting subscription details:', error);
    return {
      status: 'none',
      planId: null,
      subscriptionId: null,
      startDate: null,
      endDate: null
    };
  }
};

userSchema.statics.updateProfile = async function(firebaseUid, profileData) {
  try {
    const updateData = {
      ...profileData,
      updatedAt: new Date()
    };

    const user = await this.findOneAndUpdate(
      { firebaseUid },
      updateData,
      { new: true }
    );

    return user;
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};

const User = mongoose.model('User', userSchema);

export default User; 