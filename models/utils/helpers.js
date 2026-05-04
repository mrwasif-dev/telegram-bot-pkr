function generateReferralCode(userId) {
  return `PKR${userId}${Date.now().toString().slice(-4)}`;
}

function generateWithdrawalPin() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit PIN
}

function formatNumber(num) {
  return new Intl.NumberFormat('en-PK').format(num);
}

function getPlanLimits(plan) {
  const limits = {
    free: { dailyWithdraw: 5000, minWithdraw: 500, maxWithdraw: 10000, fee: 5 },
    basic: { dailyWithdraw: 25000, minWithdraw: 1000, maxWithdraw: 50000, fee: 2 },
    premium: { dailyWithdraw: 100000, minWithdraw: 2000, maxWithdraw: 200000, fee: 0 }
  };
  return limits[plan] || limits.free;
}

module.exports = { generateReferralCode, generateWithdrawalPin, formatNumber, getPlanLimits };
