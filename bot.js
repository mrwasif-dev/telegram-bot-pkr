const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Transaction = require('./models/Transaction');
const WithdrawRequest = require('./models/WithdrawRequest');
const { generateReferralCode, generateWithdrawalPin, formatNumber, getPlanLimits } = require('./utils/helpers');

dotenv.config();

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const ADMIN_IDS = process.env.ADMIN_IDS.split(',').map(Number);

// ==================== HELPER FUNCTIONS ====================

async function isRegistered(userId) {
  const user = await User.findOne({ userId });
  return user !== null;
}

async function getUser(userId) {
  return await User.findOne({ userId });
}

async function updateActivity(userId) {
  await User.updateOne({ userId }, { lastActivity: new Date() });
}

// ==================== KEYBOARDS ====================

function mainMenu() {
  return {
    reply_markup: {
      keyboard: [
        ['💰 My Balance', '📥 Deposit PKR'],
        ['📤 Withdraw PKR', '📋 Transaction History'],
        ['⭐ My Plan', '👤 My Profile'],
        ['🔐 Change PIN', '🏧 Withdrawal Address'],
        ['👥 Referral System', '📞 Support'],
        ['❌ Logout']
      ],
      resize_keyboard: true
    }
  };
}

function registrationMenu() {
  return {
    reply_markup: {
      keyboard: [['✅ Start Registration'], ['ℹ️ About Bot']],
      resize_keyboard: true
    }
  };
}

// ==================== REGISTRATION FLOW ====================

async function startRegistration(chatId) {
  const existingUser = await User.findOne({ userId: chatId });
  if (existingUser) {
    bot.sendMessage(chatId, '✅ You are already registered!', mainMenu());
    return;
  }

  bot.sendMessage(chatId, '🎉 *Welcome to PKR Earn Bot!*\n\nLet\'s complete your registration in 5 steps.', {
    parse_mode: 'Markdown'
  });

  // Step 1: Full Name
  bot.sendMessage(chatId, '📝 *Step 1/5:* Enter your full name:', { parse_mode: 'Markdown' });
  
  bot.once('message', async (msg1) => {
    const fullName = msg1.text;
    if (!fullName || fullName.length < 3) {
      return bot.sendMessage(chatId, '❌ Invalid name. Use /start to try again.');
    }

    // Step 2: Phone Number
    bot.sendMessage(chatId, '📱 *Step 2/5:* Enter your phone number (e.g., 03XXXXXXXXX):', { parse_mode: 'Markdown' });
    
    bot.once('message', async (msg2) => {
      const phone = msg2.text;
      if (!phone.match(/^03[0-9]{9}$/)) {
        return bot.sendMessage(chatId, '❌ Invalid phone number. Must be 03XXXXXXXXX format.');
      }

      // Step 3: Email (Optional)
      bot.sendMessage(chatId, '📧 *Step 3/5:* Enter your email (or type "skip"):', { parse_mode: 'Markdown' });
      
      bot.once('message', async (msg3) => {
        const email = msg3.text === 'skip' ? '' : msg3.text;

        // Step 4: Withdrawal Method
        bot.sendMessage(chatId, '🏧 *Step 4/5:* Choose withdrawal method:', {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'EasyPaisa', callback_data: 'method_easypaisa' }],
              [{ text: 'JazzCash', callback_data: 'method_jazzcash' }],
              [{ text: 'Bank Transfer', callback_data: 'method_bank' }]
            ]
          }
        });

        bot.once('callback_query', async (callback) => {
          const method = callback.data.split('_')[1];
          let accountNumber, accountHolder;

          if (method === 'easypaisa' || method === 'jazzcash') {
            bot.sendMessage(chatId, `📱 Enter your ${method === 'easypaisa' ? 'EasyPaisa' : 'JazzCash'} account number:`);
            bot.once('message', async (msg4) => {
              accountNumber = msg4.text;
              bot.sendMessage(chatId, '👤 Enter account holder name:');
              bot.once('message', async (msg5) => {
                accountHolder = msg5.text;
                await completeRegistration(chatId, fullName, phone, email, method, accountNumber, accountHolder);
              });
            });
          } else {
            bot.sendMessage(chatId, '🏦 Enter bank account number:');
            bot.once('message', async (msg4) => {
              accountNumber = msg4.text;
              bot.sendMessage(chatId, '👤 Enter account holder name:');
              bot.once('message', async (msg5) => {
                accountHolder = msg5.text;
                bot.sendMessage(chatId, '🏦 Enter bank name:');
                bot.once('message', async (msg6) => {
                  await completeRegistration(chatId, fullName, phone, email, method, accountNumber, accountHolder, msg6.text);
                });
              });
            });
          }
        });
      });
    });
  });
}

async function completeRegistration(chatId, fullName, phone, email, method, accountNumber, accountHolder, bankName = '') {
  const userId = chatId;
  const username = (await bot.getChat(chatId)).username || '';
  const referralCode = generateReferralCode(userId);
  const withdrawalPin = generateWithdrawalPin();
  
  const withdrawalAddress = method === 'bank' 
    ? `${bankName}: ${accountNumber} (${accountHolder})`
    : `${method.toUpperCase()}: ${accountNumber} (${accountHolder})`;

  const newUser = new User({
    userId,
    username,
    fullName,
    phoneNumber: phone,
    email,
    withdrawalPin,
    withdrawalAddress,
    referralCode,
    balance: 0
  });

  await newUser.save();

  const welcomeMsg = `🎉 *Registration Successful!*

✅ Name: ${fullName}
📱 Phone: ${phone}
💰 Balance: 0 PKR
🔐 Your Withdrawal PIN: \`${withdrawalPin}\`
⚠️ *Save this PIN! You'll need it for withdrawals.*

🔗 Your Referral Code: \`${referralCode}\`
💵 Get 100 PKR for each friend you refer!

Use the menu below to start earning.`;

  bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown', reply_markup: mainMenu().reply_markup });
}

// ==================== USER COMMANDS ====================

async function showBalance(chatId, userId) {
  const user = await getUser(userId);
  if (!user) return bot.sendMessage(chatId, '❌ Register first using /start');
  
  await updateActivity(userId);
  bot.sendMessage(chatId, `💰 *Your Balance:* ${formatNumber(user.balance)} PKR\n⭐ *Plan:* ${user.plan.toUpperCase()}`, {
    parse_mode: 'Markdown'
  });
}

async function showProfile(chatId, userId) {
  const user = await getUser(userId);
  if (!user) return bot.sendMessage(chatId, '❌ Register first using /start');
  
  const profileMsg = `👤 *Your Profile*

🆔 ID: ${user.userId}
📛 Name: ${user.fullName}
👥 Username: @${user.username || 'N/A'}
📞 Phone: ${user.phoneNumber}
💰 Balance: ${formatNumber(user.balance)} PKR
⭐ Plan: ${user.plan.toUpperCase()}
🔐 PIN: ${'*'.repeat(6)}
📅 Joined: ${new Date(user.registeredAt).toLocaleDateString()}
👥 Referrals: ${user.totalReferrals}`;

  bot.sendMessage(chatId, profileMsg, { parse_mode: 'Markdown' });
}

async function changePin(chatId, userId) {
  const user = await getUser(userId);
  if (!user) return bot.sendMessage(chatId, '❌ Register first');
  
  bot.sendMessage(chatId, '🔐 *Change Withdrawal PIN*\n\nEnter your current PIN:', { parse_mode: 'Markdown' });
  
  bot.once('message', async (msg) => {
    if (msg.text !== user.withdrawalPin) {
      return bot.sendMessage(chatId, '❌ Incorrect current PIN!');
    }
    
    bot.sendMessage(chatId, '✅ PIN verified!\n\nEnter new 6-digit PIN:');
    bot.once('message', async (msg2) => {
      if (!msg2.text.match(/^\d{6}$/)) {
        return bot.sendMessage(chatId, '❌ PIN must be 6 digits!');
      }
      
      await User.updateOne({ userId }, { withdrawalPin: msg2.text });
      bot.sendMessage(chatId, '✅ PIN changed successfully!');
    });
  });
}

async function depositRequest(chatId, userId) {
  const user = await getUser(userId);
  if (!user) return bot.sendMessage(chatId, '❌ Register first');
  
  bot.sendMessage(chatId, '💰 *Deposit Money*\n\nMinimum: 500 PKR\nMaximum: 100,000 PKR\n\nEnter amount in PKR:', {
    parse_mode: 'Markdown'
  });
  
  bot.once('message', async (msg) => {
    const amount = parseInt(msg.text);
    if (isNaN(amount) || amount < 500 || amount > 100000) {
      return bot.sendMessage(chatId, '❌ Invalid amount! Must be between 500-100,000 PKR');
    }
    
    // Show admin payment details
    const paymentMsg = `📥 *Deposit Request Created*

Amount: ${formatNumber(amount)} PKR
Transaction ID: \`TXN${Date.now()}${userId}\`

Send payment to this account:
🏦 *Bank:* HBL Bank
📋 *Account:* 1234-5678901
👤 *Title:* PKR Earn Bot

⚠️ Send exact amount and screenshot to admin.
Your balance will be updated after verification.`;
    
    bot.sendMessage(chatId, paymentMsg, { parse_mode: 'Markdown' });
    
    // Create transaction record
    await new Transaction({
      userId,
      type: 'deposit',
      amount,
      status: 'pending',
      method: 'bank'
    }).save();
    
    // Notify admins
    for (const adminId of ADMIN_IDS) {
      bot.sendMessage(adminId, `🟢 *New Deposit Request*
User: ${user.fullName} (@${user.username || 'N/A'})
User ID: ${userId}
Amount: ${formatNumber(amount)} PKR
TXN ID: TXN${Date.now()}${userId}`, { parse_mode: 'Markdown' });
    }
  });
}

async function withdrawRequest(chatId, userId) {
  const user = await getUser(userId);
  if (!user) return bot.sendMessage(chatId, '❌ Register first');
  
  const limits = getPlanLimits(user.plan);
  
  if (user.balance < limits.minWithdraw) {
    return bot.sendMessage(chatId, `❌ Minimum withdrawal is ${limits.minWithdraw} PKR.\nYour balance: ${formatNumber(user.balance)} PKR`);
  }
  
  if (!user.withdrawalAddress) {
    return bot.sendMessage(chatId, '❌ Please set withdrawal address first using "🏧 Withdrawal Address" button.');
  }
  
  bot.sendMessage(chatId, `📤 *Withdrawal Request*

Your Balance: ${formatNumber(user.balance)} PKR
Plan: ${user.plan.toUpperCase()}
Min: ${limits.minWithdraw} PKR | Max: ${limits.maxWithdraw} PKR
Fee: ${limits.fee}%

Enter amount in PKR:`, { parse_mode: 'Markdown' });
  
  bot.once('message', async (msg) => {
    const amount = parseInt(msg.text);
    if (isNaN(amount) || amount < limits.minWithdraw || amount > limits.maxWithdraw || amount > user.balance) {
      return bot.sendMessage(chatId, '❌ Invalid amount! Check your balance and limits.');
    }
    
    bot.sendMessage(chatId, '🔐 *Verify Withdrawal*\n\nEnter your 6-digit withdrawal PIN:', { parse_mode: 'Markdown' });
    
    bot.once('message', async (pinMsg) => {
      if (pinMsg.text !== user.withdrawalPin) {
        return bot.sendMessage(chatId, '❌ Incorrect PIN! Withdrawal cancelled.');
      }
      
      // Parse withdrawal address
      const addressParts = user.withdrawalAddress.split(': ');
      const method = addressParts[0].toLowerCase();
      const accountNumber = addressParts[1].split(' (')[0];
      const accountHolder = addressParts[1].split(' (')[1].replace(')', '');
      
      // Create withdrawal request
      await new WithdrawRequest({
        userId,
        amount,
        method,
        accountNumber,
        accountHolder,
        pin: user.withdrawalPin,
        status: 'pending'
      }).save();
      
      // Deduct balance temporarily
      await User.updateOne({ userId }, { $inc: { balance: -amount } });
      
      bot.sendMessage(chatId, `⏳ *Withdrawal Request Submitted!*

Amount: ${formatNumber(amount)} PKR
Fee: ${limits.fee}% (${formatNumber(amount * limits.fee / 100)} PKR)
Net: ${formatNumber(amount - (amount * limits.fee / 100))} PKR
Status: Pending Admin Approval

You'll receive funds within 24 hours.`);
      
      // Notify admins
      for (const adminId of ADMIN_IDS) {
        bot.sendMessage(adminId, `🔴 *New Withdrawal Request*
User: ${user.fullName}
User ID: ${userId}
Amount: ${formatNumber(amount)} PKR
Method: ${method.toUpperCase()}
Account: ${accountNumber}
PIN: ${user.withdrawalPin}`, { parse_mode: 'Markdown' });
      }
    });
  });
}

async function transactionHistory(chatId, userId) {
  const transactions = await Transaction.find({ userId }).sort({ createdAt: -1 }).limit(10);
  
  if (transactions.length === 0) {
    return bot.sendMessage(chatId, '📋 No transactions found.');
  }
  
  let msg = '📜 *Recent Transactions (Last 10)*\n\n';
  transactions.forEach(tx => {
    const statusEmoji = tx.status === 'completed' ? '✅' : tx.status === 'pending' ? '⏳' : '❌';
    msg += `${statusEmoji} *${tx.type.toUpperCase()}*: ${formatNumber(tx.amount)} PKR\n`;
    msg += `   📅 ${new Date(tx.createdAt).toLocaleString()}\n`;
    msg += `   🆔 ${tx.transactionId}\n\n`;
  });
  
  bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

async function referralSystem(chatId, userId) {
  const user = await getUser(userId);
  if (!user) return bot.sendMessage(chatId, '❌ Register first');
  
  const referrals = await User.find({ referredBy: userId });
  
  const msg = `👥 *Referral System*

🔗 Your Referral Code: \`${user.referralCode}\`
👥 Total Referrals: ${referrals.length}
💰 Per Referral Bonus: 100 PKR

*Share this link:*
\`https://t.me/${(await bot.getMe()).username}?start=${user.referralCode}\`

*Referral Benefits:*
• 100 PKR per referral
• 5% commission on referral deposits
• Top referrers get bonus monthly`;

  bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

async function setWithdrawalAddress(chatId, userId) {
  const user = await getUser(userId);
  if (!user) return bot.sendMessage(chatId, '❌ Register first');
  
  bot.sendMessage(chatId, '🏧 *Update Withdrawal Address*\n\nSelect method:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: 'EasyPaisa', callback_data: 'addr_easypaisa' }],
        [{ text: 'JazzCash', callback_data: 'addr_jazzcash' }],
        [{ text: 'Bank Transfer', callback_data: 'addr_bank' }]
      ]
    }
  });
  
  bot.once('callback_query', async (callback) => {
    const method = callback.data.split('_')[1];
    let address;
    
    if (method === 'easypaisa' || method === 'jazzcash') {
      bot.sendMessage(chatId, `📱 Enter your ${method === 'easypaisa' ? 'EasyPaisa' : 'JazzCash'} number:`);
      bot.once('message', async (msg1) => {
        bot.sendMessage(chatId, '👤 Enter account holder name:');
        bot.once('message', async (msg2) => {
          address = `${method.toUpperCase()}: ${msg1.text} (${msg2.text})`;
          await User.updateOne({ userId }, { withdrawalAddress: address });
          bot.sendMessage(chatId, '✅ Withdrawal address updated successfully!');
        });
      });
    } else {
      bot.sendMessage(chatId, '🏦 Enter bank account number:');
      bot.once('message', async (msg1) => {
        bot.sendMessage(chatId, '👤 Enter account holder name:');
        bot.once('message', async (msg2) => {
          bot.sendMessage(chatId, '🏦 Enter bank name:');
          bot.once('message', async (msg3) => {
            address = `BANK: ${msg1.text} (${msg2.text}) - ${msg3.text}`;
            await User.updateOne({ userId }, { withdrawalAddress: address });
            bot.sendMessage(chatId, '✅ Withdrawal address updated successfully!');
          });
        });
      });
    }
  });
}

// ==================== BOT COMMANDS ====================

bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const registered = await isRegistered(userId);
  
  // Handle referral code
  const args = msg.text.split(' ');
  if (args[1] && args[1].startsWith('ref_')) {
    const refCode = args[1].replace('ref_', '');
    const referrer = await User.findOne({ referralCode: refCode });
    if (referrer && !registered) {
      // Store referral info temporarily
      global.pendingReferral = { userId, refCode };
    }
  }
  
  if (registered) {
    await updateActivity(userId);
    bot.sendMessage(userId, '👋 Welcome back! Use the menu below.', mainMenu());
  } else {
    bot.sendMessage(userId, '🇵🇰 *Welcome to PKR Earn Bot!*\n\nEarn money easily in Pakistan.\n\n✅ Instant withdrawals\n✅ 100 PKR referral bonus\n✅ 24/7 support\n\nClick the button below to register.', {
      parse_mode: 'Markdown',
      reply_markup: registrationMenu().reply_markup
    });
  }
});

bot.onText(/✅ Start Registration/, (msg) => startRegistration(msg.chat.id));
bot.onText(/💰 My Balance/, (msg) => showBalance(msg.chat.id, msg.from.id));
bot.onText(/👤 My Profile/, (msg) => showProfile(msg.chat.id, msg.from.id));
bot.onText(/🔐 Change PIN/, (msg) => changePin(msg.chat.id, msg.from.id));
bot.onText(/📥 Deposit PKR/, (msg) => depositRequest(msg.chat.id, msg.from.id));
bot.onText(/📤 Withdraw PKR/, (msg) => withdrawRequest(msg.chat.id, msg.from.id));
bot.onText(/📋 Transaction History/, (msg) => transactionHistory(msg.chat.id, msg.from.id));
bot.onText(/👥 Referral System/, (msg) => referralSystem(msg.chat.id, msg.from.id));
bot.onText(/🏧 Withdrawal Address/, (msg) => setWithdrawalAddress(msg.chat.id, msg.from.id));
bot.onText(/⭐ My Plan/, async (msg) => {
  const user = await getUser(msg.from.id);
  if (!user) return bot.sendMessage(msg.chat.id, '❌ Register first');
  const limits = getPlanLimits(user.plan);
  bot.sendMessage(msg.chat.id, `⭐ *Your Plan: ${user.plan.toUpperCase()}*

Daily Withdraw Limit: ${formatNumber(limits.dailyWithdraw)} PKR
Min Withdraw: ${formatNumber(limits.minWithdraw)} PKR
Max Withdraw: ${formatNumber(limits.maxWithdraw)} PKR
Fee: ${limits.fee}%

Upgrade to Basic (5000 PKR) or Premium (15000 PKR) for better limits!`, { parse_mode: 'Markdown' });
});
bot.onText(/📞 Support/, (msg) => {
  bot.sendMessage(msg.chat.id, '📞 *Support*\n\nContact admin: @support_username\n\nResponse time: Within 12 hours', { parse_mode: 'Markdown' });
});
bot.onText(/❌ Logout/, (msg) => {
  bot.sendMessage(msg.chat.id, '👋 Logged out successfully. Use /start to login again.', registrationMenu());
});

console.log('🤖 User Bot is running...');
module.exports = { bot, ADMIN_IDS };
