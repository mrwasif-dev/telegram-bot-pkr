const { bot, ADMIN_IDS } = require('./bot');
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const WithdrawRequest = require('./models/WithdrawRequest');

// Admin Menu
function adminMenu() {
  return {
    reply_markup: {
      keyboard: [
        ['📊 Dashboard', '👥 All Users'],
        ['💰 Deposit Approve', '📤 Withdraw Approve'],
        ['📢 Broadcast', '⚙️ Settings'],
        ['📜 All Transactions', '❌ Close Admin']
      ],
      resize_keyboard: true
    }
  };
}

// Check if user is admin
function isAdmin(userId) {
  return ADMIN_IDS.includes(userId);
}

// Admin Dashboard
async function showDashboard(chatId) {
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ isActive: true, isBlocked: false });
  const totalBalance = await User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]);
  const pendingDeposits = await Transaction.countDocuments({ type: 'deposit', status: 'pending' });
  const pendingWithdrawals = await WithdrawRequest.countDocuments({ status: 'pending' });
  const totalDeposits = await Transaction.aggregate([
    { $match: { type: 'deposit', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalWithdrawals = await Transaction.aggregate([
    { $match: { type: 'withdraw', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const msg = `📊 *Admin Dashboard*

👥 Total Users: ${totalUsers}
🟢 Active Users: ${activeUsers}
💰 Total Balance: ${totalBalance[0]?.total || 0} PKR

📥 Pending Deposits: ${pendingDeposits}
📤 Pending Withdrawals: ${pendingWithdrawals}

💵 Total Deposits: ${totalDeposits[0]?.total || 0} PKR
💸 Total Withdrawals: ${totalWithdrawals[0]?.total || 0} PKR`;

  bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

// View All Users
async function viewAllUsers(chatId, page = 1) {
  const limit = 10;
  const skip = (page - 1) * limit;
  const users = await User.find().skip(skip).limit(limit).sort({ registeredAt: -1 });
  
  if (users.length === 0) {
    return bot.sendMessage(chatId, 'No users found.');
  }
  
  let msg = `👥 *Users (Page ${page})*\n\n`;
  users.forEach(u => {
    msg += `🆔 ${u.userId} | ${u.fullName}\n`;
    msg += `💰 Balance: ${u.balance} PKR | ⭐ ${u.plan}\n`;
    msg += `📞 ${u.phoneNumber}\n`;
    msg += `🔗 ${u.referralCode}\n`;
    msg += `📅 ${new Date(u.registeredAt).toLocaleDateString()}\n`;
    msg += `---\n`;
  });
  
  const totalUsers = await User.countDocuments();
  const hasMore = totalUsers > skip + limit;
  
  if (hasMore) {
    bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Next Page ➡️', callback_data: `admin_users_page_${page + 1}` }]
        ]
      }
    });
  } else {
    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
  }
}

// Approve Deposits
async function approveDeposits(chatId) {
  const pending = await Transaction.find({ type: 'deposit', status: 'pending' }).sort({ createdAt: 1 });
  
  if (pending.length === 0) {
    return bot.sendMessage(chatId, '✅ No pending deposits.');
  }
  
  for (const tx of pending) {
    const user = await User.findOne({ userId: tx.userId });
    const msg = `🟢 *Pending Deposit*

User: ${user?.fullName || 'Unknown'} (@${user?.username || 'N/A'})
User ID: ${tx.userId}
Amount: ${tx.amount} PKR
TXN ID: ${tx.transactionId}
Date: ${new Date(tx.createdAt).toLocaleString()}

Select action:`;
    
    bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve_deposit_${tx._id}` },
            { text: '❌ Reject', callback_data: `reject_deposit_${tx._id}` }
          ]
        ]
      }
    });
  }
}

// Approve Withdrawals
async function approveWithdrawals(chatId) {
  const pending = await WithdrawRequest.find({ status: 'pending' }).sort({ requestedAt: 1 });
  
  if (pending.length === 0) {
    return bot.sendMessage(chatId, '✅ No pending withdrawals.');
  }
  
  for (const req of pending) {
    const user = await User.findOne({ userId: req.userId });
    const msg = `🔴 *Pending Withdrawal*

User: ${user?.fullName || 'Unknown'} (@${user?.username || 'N/A'})
User ID: ${req.userId}
Amount: ${req.amount} PKR
Method: ${req.method.toUpperCase()}
Account: ${req.accountNumber}
Holder: ${req.accountHolder}
Date: ${new Date(req.requestedAt).toLocaleString()}

Select action:`;
    
    bot.sendMessage(chatId, msg, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Approve', callback_data: `approve_withdraw_${req._id}` },
            { text: '❌ Reject', callback_data: `reject_withdraw_${req._id}` }
          ]
        ]
      }
    });
  }
}

// Broadcast Message
async function broadcastMessage(chatId) {
  bot.sendMessage(chatId, '📢 *Broadcast Message*\n\nSend the message you want to broadcast to all users:', {
    parse_mode: 'Markdown'
  });
  
  bot.once('message', async (msg) => {
    const broadcastText = msg.text;
    const users = await User.find({}, 'userId');
    let success = 0;
    let failed = 0;
    
    bot.sendMessage(chatId, `⏳ Broadcasting to ${users.length} users...`);
    
    for (const user of users) {
      try {
        await bot.sendMessage(user.userId, `📢 *Announcement*\n\n${broadcastText}`, { parse_mode: 'Markdown' });
        success++;
      } catch (err) {
        failed++;
      }
      
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    bot.sendMessage(chatId, `✅ Broadcast completed!\n✅ Success: ${success}\n❌ Failed: ${failed}`);
  });
}

// Callback handlers
bot.on('callback_query', async (callback) => {
  const data = callback.data;
  const chatId = callback.message.chat.id;
  
  if (data.startsWith('admin_users_page_')) {
    const page = parseInt(data.split('_')[3]);
    await viewAllUsers(chatId, page);
  }
  
  if (data.startsWith('approve_deposit_')) {
    const txId = data.split('_')[2];
    const transaction = await Transaction.findById(txId);
    
    if (transaction) {
      await Transaction.updateOne({ _id: txId }, { status: 'completed', completedAt: new Date() });
      await User.updateOne({ userId: transaction.userId }, { $inc: { balance: transaction.amount, totalDeposits: transaction.amount } });
      
      // Give referral commission if applicable
      const user = await User.findOne({ userId: transaction.userId });
      if (user && user.referredBy) {
        const commission = transaction.amount * 0.05; // 5% commission
        await User.updateOne({ userId: user.referredBy }, { $inc: { balance: commission } });
        await new Transaction({
          userId: user.referredBy,
          type: 'commission',
          amount: commission,
          status: 'completed',
          description: `Commission from ${user.userId} deposit`
        }).save();
      }
      
      bot.sendMessage(chatId, `✅ Deposit of ${transaction.amount} PKR approved!`);
      bot.sendMessage(transaction.userId, `✅ Your deposit of ${transaction.amount} PKR has been approved! Your balance has been updated.`);
    }
  }
  
  if (data.startsWith('reject_deposit_')) {
    const txId = data.split('_')[2];
    await Transaction.updateOne({ _id: txId }, { status: 'failed' });
    bot.sendMessage(chatId, `❌ Deposit rejected!`);
  }
  
  if (data.startsWith('approve_withdraw_')) {
    const reqId = data.split('_')[2];
    const request = await WithdrawRequest.findById(reqId);
    
    if (request) {
      await WithdrawRequest.updateOne({ _id: reqId }, { status: 'approved', processedAt: new Date() });
      await new Transaction({
        userId: request.userId,
        type: 'withdraw',
        amount: request.amount,
        status: 'completed',
        method: request.method,
        accountNumber: request.accountNumber
      }).save();
      
      await User.updateOne({ userId: request.userId }, { $inc: { totalWithdrawals: request.amount } });
      
      bot.sendMessage(chatId, `✅ Withdrawal of ${request.amount} PKR approved!`);
      bot.sendMessage(request.userId, `✅ Your withdrawal of ${request.amount} PKR has been approved! Amount will be sent to your account within 24 hours.`);
    }
  }
  
  if (data.startsWith('reject_withdraw_')) {
    const reqId = data.split('_')[2];
    const request = await WithdrawRequest.findById(reqId);
    
    if (request) {
      await WithdrawRequest.updateOne({ _id: reqId }, { status: 'rejected' });
      // Refund balance
      await User.updateOne({ userId: request.userId }, { $inc: { balance: request.amount } });
      bot.sendMessage(chatId, `❌ Withdrawal rejected! Balance refunded.`);
      bot.sendMessage(request.userId, `❌ Your withdrawal request of ${request.amount} PKR was rejected. Amount has been refunded to your balance.`);
    }
  }
  
  await bot.answerCallbackQuery(callback.id);
});

// Admin Command Handler
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!isAdmin(chatId)) return;
  
  switch(text) {
    case '📊 Dashboard':
      await showDashboard(chatId);
      break;
    case '👥 All Users':
      await viewAllUsers(chatId);
      break;
    case '💰 Deposit Approve':
      await approveDeposits(chatId);
      break;
    case '📤 Withdraw Approve':
      await approveWithdrawals(chatId);
      break;
    case '📢 Broadcast':
      await broadcastMessage(chatId);
      break;
    case '📜 All Transactions':
      const allTx = await Transaction.find().sort({ createdAt: -1 }).limit(20);
      let txMsg = '📜 *Recent 20 Transactions*\n\n';
      allTx.forEach(tx => {
        txMsg += `${tx.type.toUpperCase()}: ${tx.amount} PKR - ${tx.status}\n`;
        txMsg += `User: ${tx.userId} | ${new Date(tx.createdAt).toLocaleString()}\n\n`;
      });
      bot.sendMessage(chatId, txMsg, { parse_mode: 'Markdown' });
      break;
    case '⚙️ Settings':
      bot.sendMessage(chatId, '⚙️ *Admin Settings*\n\nCommands available:\n/editplan - Change user plan\n/addbalance - Add balance to user\n/blockuser - Block user\n/unblockuser - Unblock user', { parse_mode: 'Markdown' });
      break;
    case '❌ Close Admin':
      bot.sendMessage(chatId, 'Admin panel closed.', mainMenu());
      break;
  }
  
  // Custom admin commands
  if (text.startsWith('/editplan')) {
    const parts = text.split(' ');
    if (parts.length < 3) {
      return bot.sendMessage(chatId, 'Usage: /editplan USERID PLAN (free/basic/premium)');
    }
    const userId = parseInt(parts[1]);
    const plan = parts[2];
    await User.updateOne({ userId }, { plan });
    bot.sendMessage(chatId, `✅ User ${userId} plan updated to ${plan}!`);
  }
  
  if (text.startsWith('/addbalance')) {
    const parts = text.split(' ');
    if (parts.length < 3) {
      return bot.sendMessage(chatId, 'Usage: /addbalance USERID AMOUNT');
    }
    const userId = parseInt(parts[1]);
    const amount = parseInt(parts[2]);
    await User.updateOne({ userId }, { $inc: { balance: amount } });
    bot.sendMessage(chatId, `✅ Added ${amount} PKR to user ${userId}!`);
    bot.sendMessage(userId, `🎉 Admin added ${amount} PKR to your balance! New balance: ${(await User.findOne({ userId })).balance} PKR`);
  }
});

console.log('👨‍💼 Admin Panel is running...');
