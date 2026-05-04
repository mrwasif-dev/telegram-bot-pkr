const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: Number, required: true, unique: true },
  username: { type: String, default: '' },
  fullName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  email: { type: String, default: '' },
  balance: { type: Number, default: 0 },
  plan: { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
  planExpiry: { type: Date, default: null },
  withdrawalPin: { type: String, required: true }, // 4-6 digit PIN
  withdrawalAddress: { type: String, default: '' },
  referralCode: { type: String, unique: true },
  referredBy: { type: Number, default: null },
  totalDeposits: { type: Number, default: 0 },
  totalWithdrawals: { type: Number, default: 0 },
  totalReferrals: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isBlocked: { type: Boolean, default: false },
  registeredAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
