const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'bonus', 'commission', 'refund'], required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed', 'cancelled'], default: 'pending' },
  method: { type: String, enum: ['easypaisa', 'jazzcash', 'bank', 'crypto'], default: 'easypaisa' },
  transactionId: { type: String, unique: true },
  accountNumber: { type: String },
  adminNote: { type: String },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});

transactionSchema.pre('save', function(next) {
  if (!this.transactionId) {
    this.transactionId = `TXN${Date.now()}${this.userId}${Math.floor(Math.random() * 1000)}`;
  }
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
