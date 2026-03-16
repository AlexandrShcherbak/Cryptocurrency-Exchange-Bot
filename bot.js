const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.json');
const { storage } = require('./server/storage.js');
const { ensureTablesExist } = require('./server/db.js');

// Handlers
const { handleStart } = require('./handlers/start.js');
const { handleBalance, handleTopup, handleTopupWithAmount, handlePaymentMethod, handleTopupAmountInput, handleCheckPayment, handleMyDeposits, handleMyExchanges, handleDepositDetails, handleExchangeDetails } = require('./handlers/balance.js');
const { handleBuy, handleAddressInput, handleAmountInput, handleConfirmPurchase } = require('./handlers/buy.js');
const { handleCalculator, handleCalcRubToTrx, handleCalcTrxToRub, handleRubAmountCalcInput, handleTrxAmountCalcInput } = require('./handlers/calculator.js');
const { handleAdmin, handleAddReserve, handleReserveAmountInput, handleGiveBalance, handleBroadcast, handleBroadcastMessageInput, handleUserIdForBalanceInput, handleBalanceAmountInput, handleConfirmBroadcast, handleDatabaseStatus } = require('./handlers/admin.js');
const { handleReserve } = require('./handlers/reserve.js');

// Initialize bot
const token = config.bot_token;
const bot = new TelegramBot(token, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10
        }
    }
});

// Handle polling errors
bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.log('⚠️ Другой экземпляр бота уже запущен. Пробуем переподключиться через 5 секунд...');
        setTimeout(() => {
            bot.stopPolling().then(() => {
                setTimeout(() => {
                    bot.startPolling();
                }, 2000);
            });
        }, 5000);
    } else {
        console.error('❌ Ошибка polling:', error.message);
    }
});

// Initialize database
async function initDatabase() {
    try {
        await ensureTablesExist();
        await storage.init();
        console.log('Database initialized successfully');

        // Test database connection
        const testUsers = await storage.getAllUsers();
        console.log(`📊 Database connection test: found ${testUsers.length} users`);
    } catch (error) {
        console.error('Database initialization failed:', error);
        process.exit(1);
    }
}

// Function to ensure user exists in database
async function ensureUserExists(userId, username, firstName) {
    try {
        let user = await storage.getUser(userId);
        if (!user) {
            console.log(`👤 Creating new user: ${userId}`);
            user = await storage.createUser({
                telegram_id: userId.toString(),
                username: username || null,
                first_name: firstName || null,
                balance: '0.00'
            });
            console.log(`✅ User created: ${userId}`);
        }
        return user;
    } catch (error) {
        console.error('Error ensuring user exists:', error);
        return null;
    }
}

// User states for conversation flow
const userStates = new Map();

// Command handlers
bot.onText(/\/start/, (msg) => {
    handleStart(bot, msg);
});

bot.onText(/\/buy/, (msg) => {
    handleBuy(bot, msg, userStates);
});

bot.onText(/\/balance/, (msg) => {
    handleBalance(bot, msg);
});

bot.onText(/\/admin/, (msg) => {
    handleAdmin(bot, msg.chat.id, msg.from.id, userStates);
});

// Callback query handlers
bot.on('callback_query', async (query) => {
    const message = query.message;
    const data = query.data;
    const chatId = message.chat.id;
    const userId = query.from.id;

    console.log(`🔘 Callback from ${userId}: ${data}`);

    // Ensure user exists in database
    await ensureUserExists(userId, query.from.username, query.from.first_name);

    try {
        if (data === 'buy_trx') {
            handleBuy(bot, { chat: { id: chatId }, from: { id: userId } }, userStates, message.message_id);
        } else if (data === 'balance') {
            handleBalance(bot, { chat: { id: chatId }, from: { id: userId } }, message.message_id);
        } else if (data === 'topup') {
            handleTopup(bot, chatId, userId, userStates, message.message_id);
        } else if (data.startsWith('topup_amount_')) {
            const amount = parseFloat(data.replace('topup_amount_', ''));
            handleTopupWithAmount(bot, chatId, userId, amount, userStates, message.message_id);
        } else if (data.startsWith('payment_')) {
            const parts = data.replace('payment_', '').split('_');
            const paymentMethod = parts[0];
            const amount = parts[1] ? parseFloat(parts[1]) : null;
            handlePaymentMethod(bot, chatId, userId, paymentMethod, userStates, amount, message.message_id);
        } else if (data.startsWith('check_payment_')) {
            const transactionId = parseInt(data.replace('check_payment_', ''));
            handleCheckPayment(bot, chatId, userId, transactionId, userStates, message.message_id);
        } else if (data.startsWith('cancel_topup_')) {
            const { handleCancelTopup } = require('./handlers/balance.js');
            const transactionId = parseInt(data.replace('cancel_topup_', ''));
            handleCancelTopup(bot, chatId, userId, transactionId, message.message_id);
        } else if (data.startsWith('confirm_cancel_topup_')) {
            const { handleConfirmCancelTopup } = require('./handlers/balance.js');
            const transactionId = parseInt(data.replace('confirm_cancel_topup_', ''));
            handleConfirmCancelTopup(bot, chatId, userId, transactionId, message.message_id);
        } else if (data === 'calculator') {
            handleCalculator(bot, chatId, userId, userStates, message.message_id);
        } else if (data === 'calc_rub_to_trx') {
            handleCalcRubToTrx(bot, chatId, userId, userStates, message.message_id);
        } else if (data === 'calc_trx_to_rub') {
            handleCalcTrxToRub(bot, chatId, userId, userStates, message.message_id);
        } else if (data.startsWith('confirm_purchase_')) {
            const action = data.replace('confirm_purchase_', '');
            handleConfirmPurchase(bot, chatId, userId, action, userStates);
        } else if (data === 'crystalpay_min_error') {
            await bot.answerCallbackQuery(query.id, {
                text: '❌ CrystalPay минимум 100₽. Выберите CryptoBot или увеличьте сумму',
                show_alert: true
            });
            return;
        } else if (data === 'reserve') {
            handleReserve(bot, chatId, userId, message.message_id);
        } else if (data === 'admin_panel') {
            handleAdmin(bot, chatId, userId, userStates, message.message_id);
        } else if (data === 'admin_add_reserve') {
            handleAddReserve(bot, chatId, userId, userStates, message.message_id);
        } else if (data === 'admin_give_balance') {
            handleGiveBalance(bot, chatId, userId, userStates, message.message_id);
        } else if (data === 'admin_broadcast') {
            handleBroadcast(bot, chatId, userId, userStates, message.message_id);
        } else if (data.startsWith('confirm_broadcast:')) {
            const encodedMessage = data.replace('confirm_broadcast:', '');
            const broadcastMessage = Buffer.from(encodedMessage, 'base64').toString();
            handleConfirmBroadcast(bot, chatId, userId, broadcastMessage, message.message_id);
        } else if (data === 'admin_db_status') {
            handleDatabaseStatus(bot, chatId, userId, userStates, message.message_id);
        } else if (data.startsWith('my_deposits_')) {
            const page = parseInt(data.replace('my_deposits_', ''));
            handleMyDeposits(bot, chatId, userId, page, message.message_id);
        } else if (data.startsWith('my_exchanges_')) {
            const page = parseInt(data.replace('my_exchanges_', ''));
            handleMyExchanges(bot, chatId, userId, page, message.message_id);
        } else if (data.startsWith('deposit_details_')) {
            const transactionId = parseInt(data.replace('deposit_details_', ''));
            handleDepositDetails(bot, chatId, userId, transactionId, message.message_id);
        } else if (data.startsWith('exchange_details_')) {
            const transactionId = parseInt(data.replace('exchange_details_', ''));
            handleExchangeDetails(bot, chatId, userId, transactionId, message.message_id);
        } else if (data === 'start') {
            userStates.delete(userId);
            handleStart(bot, { chat: { id: chatId }, from: { id: userId, first_name: query.from.first_name } }, message.message_id);
        } else if (data === 'main_menu') {
            userStates.delete(userId);
            handleStart(bot, { chat: { id: chatId }, from: { id: userId, first_name: query.from.first_name } }, message.message_id);
        }
    } catch (error) {
        console.error('Callback query error:', error);
        await bot.answerCallbackQuery(query.id, { text: '❌ Произошла ошибка' });
    }

    await bot.answerCallbackQuery(query.id);
});

// Text message handlers
bot.on('message', async (msg) => {
    if (msg.chat.type !== 'private') return;

    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    console.log(`📨 Message from ${userId}: ${text}`);

    // Ensure user exists in database
    await ensureUserExists(userId, msg.from.username, msg.from.first_name);

    // Skip commands and callbacks
    if (text && text.startsWith('/')) return;

    const userState = userStates.get(userId);
    if (!userState) return;

    try {
        // Delete user's input message
        try {
            await bot.deleteMessage(chatId, msg.message_id);
        } catch (e) {
            // Ignore if can't delete
        }

        if (userState.step === 'waiting_address') {
            handleAddressInput(bot, chatId, userId, text, userStates);
        } else if (userState.step === 'waiting_amount') {
            handleAmountInput(bot, chatId, userId, text, userStates);
        } else if (userState.step === 'waiting_topup_amount') {
            handleTopupAmountInput(bot, chatId, userId, text, userStates);
        } else if (userState.step === 'waiting_rub_amount_calc') {
            handleRubAmountCalcInput(bot, chatId, userId, text, userStates);
        } else if (userState.step === 'waiting_trx_amount_calc') {
            handleTrxAmountCalcInput(bot, chatId, userId, text, userStates);
        } else if (userState.step === 'waiting_reserve_amount') {
            handleReserveAmountInput(bot, chatId, userId, text, userStates);
        } else if (userState.step === 'waiting_broadcast_message') {
            handleBroadcastMessageInput(bot, chatId, userId, text, userStates);
        } else if (userState.step === 'waiting_user_id_for_balance') {
            handleUserIdForBalanceInput(bot, chatId, userId, text, userStates);
        } else if (userState.step === 'waiting_balance_amount') {
            handleBalanceAmountInput(bot, chatId, userId, text, userStates);
        }
    } catch (error) {
        console.error('Message handler error:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке сообщения');
    }
});

// Error handling
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

// Initialize database and start bot
initDatabase().then(() => {
    console.log('🚀 AiogramExchange Bot запущен!');
}).catch(error => {
    console.error('Failed to start bot:', error);
    process.exit(1);
});