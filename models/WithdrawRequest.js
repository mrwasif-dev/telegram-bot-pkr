const mongoose = require('mongoose');

const withdrawRequestSchema = new mongoose.Schema({
  userId: { type: Number, required: true },
  amount: { type: Number, required: true },
  method: { type: String, enum: ['easypaisa', 'jazzcash', 'bank'], required: true },
  accountNumber: { type: String, required: true },
  accountHolder: { type: String, required: true },
  pin: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  adminNote: { type: String },
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
});

module.exports = mongoose.model('WithdrawRequest', withdrawRequestSchema);
