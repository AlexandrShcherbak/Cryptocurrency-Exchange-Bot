const tronService = require('../services/tron');
const ratesService = require('../services/rates');
const { storage } = require('../server/storage');
const { formatCurrency, formatTRX, createTreeStructure, validateAmount } = require('../utils/helpers');
const config = require('../config.json');

const handleBuy = async (bot, msg, userStates, messageId = null) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        const user = await storage.getUser(userId);
        const rate = await ratesService.getTRXRateInRUB();
        const minTrx = config.min_trx_purchase;
        const availableTrx = await ratesService.calculateTRXAmount(user.balance);

        const buyInfo = createTreeStructure([
            `Курс: ${formatCurrency(rate)}`,
            `Ваш баланс: ${formatCurrency(user.balance)}`,
            `Минимум к покупке: ${minTrx} TRX`,
            `Доступно к покупке: ${formatTRX(availableTrx)}`
        ]);

        const message = `🟠 *Покупка TRX*\n${buyInfo}\n\nВведите адрес вашего TRX кошелька:`;

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Назад в меню', callback_data: 'main_menu' }
            ]]
        };

        // Set user state
        userStates.set(userId, {
            step: 'waiting_address',
            rate: rate,
            balance: user.balance,
            minTrx: minTrx,
            messageId: messageId
        });

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                const sentMessage = await bot.sendMessage(chatId, message, { 
                    parse_mode: 'Markdown',
                    reply_markup: keyboard 
                });
                const userState = userStates.get(userId);
                if (userState) {
                    userState.messageId = sentMessage.message_id;
                    userStates.set(userId, userState);
                }
            }
        } else {
            const sentMessage = await bot.sendMessage(chatId, message, { 
                parse_mode: 'Markdown',
                reply_markup: keyboard 
            });
            const userState = userStates.get(userId);
            if (userState) {
                userState.messageId = sentMessage.message_id;
                userStates.set(userId, userState);
            }
        }
    } catch (error) {
        console.error('Buy handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при получении информации');
    }
};

const handleAddressInput = async (bot, chatId, userId, address, userStates) => {
    try {
        const userState = userStates.get(userId);
        if (!userState || userState.step !== 'waiting_address') return;

        // Validate TRX address
        const isValid = await tronService.validateAddress(address);
        
        if (!isValid) {
            const errorMessage = '❌ *Неверный адрес TRX кошелька*\n\nПожалуйста, введите корректный адрес:';
            const keyboard = {
                inline_keyboard: [[
                    { text: '🔙 Назад в меню', callback_data: 'main_menu' }
                ]]
            };
            
            try {
                await bot.editMessageText(errorMessage, {
                    chat_id: chatId,
                    message_id: userState.messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                await bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown', reply_markup: keyboard });
            }
            return;
        }

        // Update user state with validated address
        userState.address = address;
        userState.step = 'waiting_amount';
        userStates.set(userId, userState);

        const availableTrx = await ratesService.calculateTRXAmount(userState.balance);
        const shortenedAddress = tronService.formatAddressWithLink(address);

        const buyInfo = createTreeStructure([
            `Курс: ${formatCurrency(userState.rate)}`,
            `Ваш баланс: ${formatCurrency(userState.balance)}`,
            `Минимум к покупке: ${userState.minTrx} TRX`,
            `Доступно к покупке: ${formatTRX(availableTrx)}`,
            `Адрес: ${shortenedAddress}`
        ]);

        const message = `🟠 *Покупка TRX*\n${buyInfo}\n\nВведите количество TRX для покупки:`;

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Назад в меню', callback_data: 'main_menu' }
            ]]
        };

        // Try to edit existing message
        try {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: userState.messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
        } catch (error) {
            // If editing fails, send new message
            const sentMessage = await bot.sendMessage(chatId, message, { 
                parse_mode: 'Markdown',
                reply_markup: keyboard,
                disable_web_page_preview: true
            });
            userState.messageId = sentMessage.message_id;
            userStates.set(userId, userState);
        }
    } catch (error) {
        console.error('Address input handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при проверке адреса');
    }
};

const handleAmountInput = async (bot, chatId, userId, amountText, userStates) => {
    try {
        const userState = userStates.get(userId);
        if (!userState || userState.step !== 'waiting_amount') return;

        const amount = validateAmount(amountText, userState.minTrx);
        
        if (!amount) {
            await bot.sendMessage(chatId, `❌ Неверное количество\n\nМинимальная покупка: ${userState.minTrx} TRX\nВведите корректное количество:`);
            return;
        }

        if (amount < userState.minTrx) {
            await bot.sendMessage(chatId, `❌ Слишком маленькая сумма\n\nМинимальная покупка: ${userState.minTrx} TRX\nВведите количество не менее ${userState.minTrx} TRX:`);
            return;
        }

        const totalCost = await ratesService.calculateRubAmount(amount);
        const shortage = totalCost - userState.balance;

        // Show confirmation with purchase details
        await showPurchaseConfirmation(bot, chatId, userId, amount, totalCost, userState.address, userStates);

    } catch (error) {
        console.error('Amount input handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке покупки');
    }
};

const processPurchase = async (bot, chatId, userId, trxAmount, rubAmount, address, userStates) => {
    try {
        // Check reserve availability
        const currentReserve = await storage.getReserve();
        if (currentReserve < trxAmount) {
            await bot.sendMessage(chatId, `❌ Недостаточно TRX в резерве обменника\n\nДоступно: ${formatTRX(currentReserve)}\nТребуется: ${formatTRX(trxAmount)}\n\nОбратитесь в поддержку`);
            return;
        }

        // Deduct balance
        const updatedUser = await storage.subtractBalance(userId, rubAmount);
        
        if (!updatedUser) {
            await bot.sendMessage(chatId, '❌ Ошибка при списании средств');
            return;
        }

        // Subtract from reserve
        const reserveUpdated = await storage.subtractReserve(trxAmount);
        if (!reserveUpdated) {
            // Return balance to user if reserve operation failed
            await storage.updateUserBalance(userId, rubAmount);
            await bot.sendMessage(chatId, '❌ Ошибка при обработке резерва. Средства возвращены на баланс');
            return;
        }

        // Create transaction record
        const transaction = await storage.addTransaction(userId, 'purchase', rubAmount, {
            trx_amount: trxAmount,
            trx_address: address,
            rate: await ratesService.getTRXRateInRUB()
        });

        // Update transaction status (in real app, this would happen after actual TRX transfer)
        await storage.updateTransaction(transaction.id, { status: 'completed' });

        const successInfo = createTreeStructure([
            `Количество: ${formatTRX(trxAmount)}`,
            `Сумма: ${formatCurrency(rubAmount)}`,
            `Адрес: ${tronService.formatAddressWithLink(address)}`,
            `Новый баланс: ${formatCurrency(updatedUser.balance)}`
        ]);

        const message = `✅ *Покупка успешно выполнена*\n${successInfo}\n\n💎 TRX будут переведены на ваш кошелек в течение 5-10 минут`;

        const userState = userStates.get(userId);
        const messageId = userState?.messageId;

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            } catch (error) {
                await bot.sendMessage(chatId, message, { 
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            }
        } else {
            await bot.sendMessage(chatId, message, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        }

        // Send notification to admin
        try {
            const config = require('../config.json');
            const user = await storage.getUser(userId);
            const adminMessage = `🚨 *Новая покупка TRX*\n\n` +
                `👤 Пользователь: ${user.username || user.first_name || 'ID: ' + userId}\n` +
                `📊 Количество: ${formatTRX(trxAmount)}\n` +
                `💰 Сумма: ${formatCurrency(rubAmount)}\n` +
                `📍 Адрес: \`${address}\`\n` +
                `🆔 Транзакция: #${transaction.id}\n` +
                `⏰ Время: ${new Date().toLocaleString('ru-RU')}`;
                
            await bot.sendMessage(config.admin_id, adminMessage, { 
                parse_mode: 'Markdown' 
            });
        } catch (error) {
            console.error('Admin notification error:', error.message);
        }

        // Clear user state
        userStates.delete(userId);

    } catch (error) {
        console.error('Purchase processing error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке покупки');
    }
};

const showPurchaseConfirmation = async (bot, chatId, userId, trxAmount, totalCost, address, userStates) => {
    try {
        const user = await storage.getUser(userId);
        const shortfall = Math.max(0, totalCost - user.balance);
        const canAfford = user.balance >= totalCost;
        
        const userState = userStates.get(userId);
        const messageId = userState?.messageId;
        
        userStates.set(userId, {
            step: 'confirming_purchase',
            trxAmount: trxAmount,
            totalCost: totalCost,
            address: address,
            shortfall: shortfall,
            messageId: messageId
        });

        let confirmationInfo;
        let message;
        let keyboard;

        if (canAfford) {
            // User can afford full purchase
            confirmationInfo = createTreeStructure([
                `Количество: ${formatTRX(trxAmount)}`,
                `Стоимость: ${formatCurrency(totalCost)}`,
                `Ваш баланс: ${formatCurrency(user.balance)}`,
                `Кошелек: ${address.substring(0, 10)}...${address.substring(address.length - 6)}`
            ]);

            message = `💰 *Подтверждение покупки*\n${confirmationInfo}\n\nВы хотите купить ${formatTRX(trxAmount)} за ${formatCurrency(totalCost)}?`;

            keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Да, купить', callback_data: 'confirm_purchase_yes' },
                        { text: '❌ Нет, отменить', callback_data: 'confirm_purchase_no' }
                    ]
                ]
            };
        } else {
            // User needs to top up
            confirmationInfo = createTreeStructure([
                `Количество: ${formatTRX(trxAmount)}`,
                `Стоимость: ${formatCurrency(totalCost)}`,
                `Ваш баланс: ${formatCurrency(user.balance)}`,
                `Нужно доплатить: ${formatCurrency(shortfall)}`,
                `Кошелек: ${address.substring(0, 10)}...${address.substring(address.length - 6)}`
            ]);

            message = `💰 *Подтверждение покупки*\n${confirmationInfo}\n\nДля покупки не хватает ${formatCurrency(shortfall)}. Доплатить?`;

            keyboard = {
                inline_keyboard: [
                    [
                        { text: '💳 Доплатить', callback_data: 'confirm_purchase_topup' },
                        { text: '❌ Отменить', callback_data: 'confirm_purchase_no' }
                    ]
                ]
            };
        }

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                await bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        } else {
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }

    } catch (error) {
        console.error('Purchase confirmation error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при подтверждении покупки');
    }
};

const handleConfirmPurchase = async (bot, chatId, userId, action, userStates) => {
    try {
        const userState = userStates.get(userId);
        if (!userState || userState.step !== 'confirming_purchase') {
            await bot.sendMessage(chatId, '❌ Ошибка: данные покупки не найдены');
            return;
        }

        if (action === 'yes') {
            // Process full purchase
            await processPurchase(bot, chatId, userId, userState.trxAmount, userState.totalCost, userState.address, userStates);
        } else if (action === 'topup') {
            // Create invoice for shortfall amount
            userStates.set(userId, {
                step: 'waiting_topup_for_purchase',
                trxAmount: userState.trxAmount,
                totalCost: userState.totalCost,
                address: userState.address,
                shortfall: userState.shortfall
            });

            const balanceHandler = require('./balance');
            await balanceHandler.handleTopupWithAmount(bot, chatId, userId, userState.shortfall, userStates, null);
        } else {
            // Cancel purchase
            await bot.sendMessage(chatId, '❌ Покупка отменена');
            userStates.delete(userId);
        }
    } catch (error) {
        console.error('Confirm purchase handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при обработке подтверждения');
    }
};

module.exports = {
    handleBuy,
    handleAddressInput,
    handleAmountInput,
    handleConfirmPurchase
};
