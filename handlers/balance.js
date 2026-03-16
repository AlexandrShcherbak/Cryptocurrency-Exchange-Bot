const { storage } = require('../server/storage');
const paymentsService = require('../services/payments');
const { formatCurrency, createTreeStructure, validateAmount } = require('../utils/helpers');

const handleBalance = async (bot, msg, messageId = null) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        const user = await storage.getUser(userId);
        const transactions = await storage.getUserTransactions(userId, 5);

        const balanceInfo = createTreeStructure([
            `Текущий баланс: ${formatCurrency(user.balance)}`,
            `Всего операций: ${transactions.length}`
        ]);

        let message = `💳 *Ваш баланс*\n${balanceInfo}`;

        if (transactions.length > 0) {
            message += '\n\n📊 *Последние операции:*\n';
            transactions.forEach((tx, index) => {
                const date = new Date(tx.created_at).toLocaleDateString('ru-RU');
                const typeEmoji = tx.type === 'deposit' ? '💰' : tx.type === 'purchase' ? '💎' : '🔄';
                const statusEmoji = tx.status === 'completed' ? '✅' : tx.status === 'pending' ? '⏳' : '❌';

                message += `${typeEmoji} ${formatCurrency(tx.amount)} ${statusEmoji} ${date}\n`;
            });
        }

        const keyboard = {
            inline_keyboard: [[
                { text: '💰 Пополнить баланс', callback_data: 'topup' },
                { text: '📊 Мои пополнения', callback_data: 'my_deposits_1' }
            ], [
                { text: '💎 Мои обмены', callback_data: 'my_exchanges_1' },
                { text: '🔙 Назад', callback_data: 'start' }
            ]]
        };

        if (messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                console.log('Could not edit message, sending new one');
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
        console.error('Balance error:', error.message);
        console.error('Full error:', error);

        const errorMessage = '❌ Произошла ошибка при получении баланса';

        if (messageId) {
            try {
                await bot.editMessageText(errorMessage, {
                    chat_id: chatId,
                    message_id: messageId
                });
            } catch (editError) {
                await bot.sendMessage(chatId, errorMessage);
            }
        } else {
            await bot.sendMessage(chatId, errorMessage);
        }
    }
};

const handleTopup = async (bot, chatId, userId, userStates, messageId = null) => {
    try {
        userStates.set(userId, {
            step: 'waiting_topup_amount',
            payment_method: null,
            messageId: messageId
        });

        const message = '💰 *Пополнение баланса*\n\nВведите сумму для пополнения (в рублях):\n\nМинимальная сумма:\n🤖 CryptoBot: 5 ₽\n💎 CrystalPay: 100 ₽';

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Назад в меню', callback_data: 'main_menu' }
            ]]
        };

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
        console.error('Topup handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

const handlePaymentMethod = async (bot, chatId, userId, paymentMethod, userStates, amount = null, messageId = null) => {
    try {
        if (!amount) {
            userStates.set(userId, {
                step: 'waiting_topup_amount',
                payment_method: paymentMethod
            });

            const methodName = paymentMethod === 'crystalpay' ? 'CrystalPay' : 'CryptoBot';
            const minAmount = paymentMethod === 'crystalpay' ? '100 ₽' : '5 ₽';
            const message = `💰 *Пополнение через ${methodName}*\n\nВведите сумму для пополнения (в рублях):\n\nМинимальная сумма: ${minAmount}`;

            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
            return;
        }

        // Validate minimum amount for payment method
        const minAmount = paymentMethod === 'crystalpay' ? 100 : 5;
        if (amount < minAmount) {
            const methodName = paymentMethod === 'crystalpay' ? 'CrystalPay' : 'CryptoBot';
            await bot.sendMessage(chatId, `❌ Слишком маленькая сумма для ${methodName}\n\nМинимальная сумма: ${minAmount} ₽`);
            return;
        }

        // Create invoice directly with amount
        await createInvoice(bot, chatId, userId, paymentMethod, amount, messageId);
    } catch (error) {
        console.error('Payment method handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

const createInvoice = async (bot, chatId, userId, paymentMethod, amount, messageId = null) => {
    try {
        console.log(`📋 Creating invoice: user=${userId}, method=${paymentMethod}, amount=${amount}`);
        
        const minAmount = paymentMethod === 'crystalpay' ? 100 : 5;
        if (amount < minAmount) {
            const methodName = paymentMethod === 'crystalpay' ? 'CrystalPay' : 'CryptoBot';
            await bot.sendMessage(chatId, `❌ Минимальная сумма пополнения для ${methodName}: ${minAmount} ₽`);
            return;
        }

        const description = `Пополнение баланса AiogramExchange на сумму ${formatCurrency(amount)}`;
        let invoiceResult;

        console.log(`💳 Calling payment service for ${paymentMethod}...`);
        
        if (paymentMethod === 'crystalpay') {
            invoiceResult = await paymentsService.createCrystalPayInvoice(amount, description, userId);
        } else if (paymentMethod === 'cryptobot') {
            invoiceResult = await paymentsService.createCryptoBotInvoice(amount, description, userId);
        }

        console.log(`💳 Invoice result:`, invoiceResult);

        if (!invoiceResult || !invoiceResult.success) {
            const errorMsg = invoiceResult?.error || 'Неизвестная ошибка';

            let userMessage;
            if (errorMsg.includes('UNAUTHORIZED') && paymentMethod === 'cryptobot') {
                userMessage = `⚠️ CryptoBot временно недоступен\n\nПопробуйте CrystalPay или повторите попытку позже.`;
            } else if (paymentMethod === 'crystalpay') {
                userMessage = `⚠️ CrystalPay временно недоступен\n\nПопробуйте CryptoBot или повторите попытку позже.`;
            } else {
                userMessage = `⚠️ ${paymentMethod === 'crystalpay' ? 'CrystalPay' : 'CryptoBot'} временно недоступен\n\nПопробуйте другой способ оплаты или повторите позже.`;
            }

            // Предложить альтернативный способ оплаты
            const keyboard = {
                inline_keyboard: []
            };

            if (paymentMethod === 'cryptobot' && amount >= 100) {
                keyboard.inline_keyboard.push([
                    { text: '💎 Попробовать CrystalPay', callback_data: `payment_crystalpay_${amount}` }
                ]);
            } else if (paymentMethod === 'crystalpay' && amount >= 5) {
                keyboard.inline_keyboard.push([
                    { text: '🤖 Попробовать CryptoBot', callback_data: `payment_cryptobot_${amount}` }
                ]);
            }

            keyboard.inline_keyboard.push([
                { text: '🔙 Назад к выбору суммы', callback_data: 'topup' }
            ]);

            await bot.sendMessage(chatId, userMessage, {
                reply_markup: keyboard
            });
            return;
        }

        console.log(`💳 Creating transaction with metadata:`, {
            payment_method: paymentMethod,
            invoice_id: invoiceResult.invoice_id,
            payment_id: invoiceResult.invoice_id
        });

        // Create pending transaction
        console.log(`💾 Creating transaction for user ${userId}...`);
        const transaction = await storage.addTransaction(userId, 'deposit', amount, {
            payment_method: paymentMethod,
            invoice_id: invoiceResult.invoice_id,
            payment_id: invoiceResult.invoice_id
        });
        console.log(`✅ Transaction created:`, transaction);

        const paymentInfo = createTreeStructure([
            `Сумма: ${formatCurrency(amount)}`,
            `Способ: ${paymentMethod === 'crystalpay' ? 'CrystalPay' : 'CryptoBot'}`,
            `ID счета: \`${invoiceResult.invoice_id}\``
        ]);

        const message = `💳 *Счет для оплаты создан*\n${paymentInfo}\n\nДля оплаты нажмите кнопку ниже.\nСчет действителен в течение 1 часа.`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '💰 Перейти к оплате', url: invoiceResult.url }],
                [{ text: '🔄 Проверить оплату', callback_data: `check_payment_${transaction.id}` }],
                [{ text: '❌ Отменить пополнение', callback_data: `cancel_topup_${transaction.id}` }]
            ]
        };

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
        console.error('Create invoice error:', error.message);
        console.error('Full error stack:', error.stack);
        console.error('Error details:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при создании счета');
    }
};

const handleTopupWithAmount = async (bot, chatId, userId, amount, userStates, messageId = null) => {
    try {
        const message = `💰 *Пополнение на ${formatCurrency(amount)}*\n\nВыберите способ пополнения:`;

        // Create keyboard with availability based on amount
        const keyboardButtons = [];

        if (amount >= 100) {
            keyboardButtons.push([
                { text: '💎 CrystalPay', callback_data: `payment_crystalpay_${amount}` },
                { text: '🤖 CryptoBot', callback_data: `payment_cryptobot_${amount}` }
            ]);
        } else if (amount >= 5) {
            keyboardButtons.push([
                { text: '🤖 CryptoBot', callback_data: `payment_cryptobot_${amount}` }
            ]);
            keyboardButtons.push([
                { text: '💎 CrystalPay (мин. 100₽)', callback_data: 'crystalpay_min_error' }
            ]);
        }

        const keyboard = {
            inline_keyboard: keyboardButtons
        };

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
        console.error('Topup with amount handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

const handleTopupAmountInput = async (bot, chatId, userId, amountText, userStates) => {
    try {
        const userState = userStates.get(userId);
        if (!userState || userState.step !== 'waiting_topup_amount') return;

        const amount = validateAmount(amountText, 5);

        if (!amount) {
            const errorMessage = '❌ Неверная сумма\n\nМинимальная сумма пополнения:\n🤖 CryptoBot: 5 ₽\n💎 CrystalPay: 100 ₽\nВведите корректную сумму:';

            const keyboard = {
                inline_keyboard: [[
                    { text: '🔙 Назад в меню', callback_data: 'main_menu' }
                ]]
            };

            if (userState.messageId) {
                try {
                    await bot.editMessageText(errorMessage, {
                        chat_id: chatId,
                        message_id: userState.messageId,
                        reply_markup: keyboard
                    });
                } catch (error) {
                    await bot.sendMessage(chatId, errorMessage, { reply_markup: keyboard });
                }
            } else {
                await bot.sendMessage(chatId, errorMessage, { reply_markup: keyboard });
            }
            return;
        }

        if (amount < 5) {
            const errorMessage = '❌ Слишком маленькая сумма\n\nМинимальная сумма пополнения:\n🤖 CryptoBot: 5 ₽\n💎 CrystalPay: 100 ₽';

            const keyboard = {
                inline_keyboard: [[
                    { text: '🔙 Назад в меню', callback_data: 'main_menu' }
                ]]
            };

            if (userState.messageId) {
                try {
                    await bot.editMessageText(errorMessage, {
                        chat_id: chatId,
                        message_id: userState.messageId,
                        reply_markup: keyboard
                    });
                } catch (error) {
                    await bot.sendMessage(chatId, errorMessage, { reply_markup: keyboard });
                }
            } else {
                await bot.sendMessage(chatId, errorMessage, { reply_markup: keyboard });
            }
            return;
        }

        const message = `💰 *Пополнение на ${formatCurrency(amount)}*\n\nВыберите способ пополнения:`;

        // Create keyboard with availability based on amount
        const keyboardButtons = [];

        if (amount >= 100) {
            keyboardButtons.push([
                { text: '💎 CrystalPay', callback_data: `payment_crystalpay_${amount}` },
                { text: '🤖 CryptoBot', callback_data: `payment_cryptobot_${amount}` }
            ]);
        } else if (amount >= 5) {
            keyboardButtons.push([
                { text: '🤖 CryptoBot', callback_data: `payment_cryptobot_${amount}` }
            ]);
            keyboardButtons.push([
                { text: '💎 CrystalPay (мин. 100₽)', callback_data: 'crystalpay_min_error' }
            ]);
        }

        keyboardButtons.push([
            { text: '🔙 Назад в меню', callback_data: 'main_menu' }
        ]);

        const keyboard = {
            inline_keyboard: keyboardButtons
        };

        if (userState.messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: userState.messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                const sentMessage = await bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                userState.messageId = sentMessage.message_id;
                userStates.set(userId, userState);
            }
        } else {
            const sentMessage = await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            userState.messageId = sentMessage.message_id;
            userStates.set(userId, userState);
        }

        // Don't clear user state if this is part of a purchase flow
        if (!userState.trxAmount) {
            // Only clear state for regular topups, not purchase-related topups
            userStates.delete(userId);
        }

    } catch (error) {
        console.error('Topup amount input handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при создании счета');
    }
};

const handleCheckPayment = async (bot, chatId, userId, transactionId, userStates = new Map(), messageId = null) => {
    try {
        console.log(`🔍 Checking payment for user ${userId}, transaction ${transactionId}`);

        const transaction = await storage.getTransaction(transactionId);

        if (!transaction || transaction.telegram_id !== userId.toString()) {
            console.log(`❌ Transaction not found or user mismatch. Transaction:`, transaction);
            await bot.sendMessage(chatId, '❌ Транзакция не найдена');
            return;
        }

        // Parse metadata if it's a JSON string
        let metadata = {};
        try {
            if (typeof transaction.metadata === 'string') {
                metadata = JSON.parse(transaction.metadata);
            } else if (transaction.metadata && typeof transaction.metadata === 'object') {
                metadata = transaction.metadata;
            }
        } catch (error) {
            console.error('Error parsing metadata:', error);
        }

        console.log(`📋 Transaction found:`, {
            id: transaction.id,
            status: transaction.status,
            amount: transaction.amount,
            metadata: metadata
        });

        if (transaction.status === 'completed') {
            console.log(`✅ Transaction already completed`);
            await bot.sendMessage(chatId, '✅ Оплата уже была зачислена на ваш баланс');
            return;
        }

        const paymentMethod = metadata.payment_method;
        const invoiceId = metadata.invoice_id;

        if (!paymentMethod || !invoiceId) {
            console.log(`❌ Missing payment method or invoice ID in metadata:`, metadata);
            await bot.sendMessage(chatId, '❌ Ошибка в данных транзакции. Обратитесь в поддержку');
            return;
        }

        console.log(`🔍 Checking ${paymentMethod} invoice ${invoiceId}`);

        let paymentResult;

        if (paymentMethod === 'crystalpay') {
            paymentResult = await paymentsService.checkCrystalPayInvoice(invoiceId);
        } else if (paymentMethod === 'cryptobot') {
            paymentResult = await paymentsService.checkCryptoBotInvoice(invoiceId);
        }

        console.log(`💰 Payment check result:`, paymentResult);

        if (!paymentResult || !paymentResult.success) {
            console.log(`❌ Payment check failed or not successful`);
            await bot.sendMessage(chatId, '⏳ Оплата ещё не поступила\n\nПопробуйте проверить позже или обратитесь в поддержку');
            return;
        }

        console.log(`🎯 Payment status from API: "${paymentResult.status}"`);

        // Check if payment is completed
        // CrystalPay v3: 'payed' - оплачено полностью
        // CryptoBotPay: 'paid' - оплачено
        if (paymentResult.status === 'payed' || paymentResult.status === 'paid' || paymentResult.status === 'completed') {
            console.log(`✅ Payment confirmed! Updating transaction and balance...`);

            // Update transaction status
            await storage.updateTransactionStatus(transactionId, 'completed');

            // Add balance to user
            await storage.updateUserBalance(userId, transaction.amount);

            // Check if this payment was for a pending purchase
            const userState = userStates.get(userId);
            if (userState && userState.step === 'waiting_topup_for_purchase') {
                // Continue with the original purchase
                const buyHandler = require('./buy');
                await buyHandler.handleConfirmPurchase(bot, chatId, userId, 'yes', userStates);
                return;
            }

            const message = `✅ *Оплата подтверждена!*\n\nСумма ${formatCurrency(transaction.amount)} зачислена на ваш баланс`;

            const keyboard = {
                inline_keyboard: [[
                    { text: '💳 Мой баланс', callback_data: 'balance' },
                    { text: '🔙 Главное меню', callback_data: 'main_menu' }
                ]]
            };

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
        } else {
            console.log(`❌ Payment status "${paymentResult.status}" not recognized as completed`);
            await bot.sendMessage(chatId, '⏳ Оплата ещё не поступила\n\nПопробуйте проверить позже');
        }

    } catch (error) {
        console.error('Check payment error:', error.message);
        console.error('Full error:', error);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при проверке оплаты');
    }
};

const handleCancelTopup = async (bot, chatId, userId, transactionId, messageId = null) => {
    try {
        const transaction = await storage.getTransaction(transactionId);

        if (!transaction || transaction.telegram_id !== userId.toString()) {
            await bot.sendMessage(chatId, '❌ Транзакция не найдена');
            return;
        }

        if (transaction.status === 'completed') {
            await bot.sendMessage(chatId, '❌ Нельзя отменить завершенную транзакцию');
            return;
        }

        const message = `❓ *Подтверждение отмены*\n\nВы действительно хотите отменить пополнение на ${formatCurrency(transaction.amount)}?\n\nID пополнения: \`${transaction.id}\``;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Да, отменить', callback_data: `confirm_cancel_topup_${transaction.id}` },
                    { text: '❌ Нет, оставить', callback_data: `check_payment_${transaction.id}` }
                ],
                [{ text: '🔙 Главное меню', callback_data: 'main_menu' }]
            ]
        };

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
        console.error('Cancel topup error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при отмене пополнения');
    }
};

const handleConfirmCancelTopup = async (bot, chatId, userId, transactionId, messageId = null) => {
    try {
        const transaction = await storage.getTransaction(transactionId);

        if (!transaction || transaction.telegram_id !== userId.toString()) {
            await bot.sendMessage(chatId, '❌ Транзакция не найдена');
            return;
        }

        if (transaction.status === 'completed') {
            await bot.sendMessage(chatId, '❌ Нельзя отменить завершенную транзакцию');
            return;
        }

        // Update transaction status to cancelled
        await storage.updateTransactionStatus(transactionId, 'cancelled');

        const message = `✅ *Пополнение отменено*\n\nПополнение на ${formatCurrency(transaction.amount)} было отменено\n\nID пополнения: \`${transaction.id}\``;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💰 Новое пополнение', callback_data: 'topup' },
                    { text: '🔙 Главное меню', callback_data: 'main_menu' }
                ]
            ]
        };

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
        console.error('Confirm cancel topup error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при отмене пополнения');
    }
};

// История пополнений с пагинацией
const handleMyDeposits = async (bot, chatId, userId, page = 1, messageId = null) => {
    try {
        const limit = 5;
        const offset = (page - 1) * limit;
        
        // Получаем пополнения пользователя
        const allDeposits = await storage.getUserTransactionsByType(userId, 'deposit');
        const totalCount = allDeposits.length;
        const deposits = allDeposits.slice(offset, offset + limit);
        
        const totalPages = Math.ceil(totalCount / limit);
        
        let message = `📊 *Мои пополнения*\n\nСтраница ${page} из ${totalPages}\nВсего пополнений: ${totalCount}\n\n`;
        
        const keyboard = { inline_keyboard: [] };
        
        if (deposits.length === 0) {
            message += '📭 У вас пока нет пополнений';
        } else {
            deposits.forEach((deposit, index) => {
                const date = new Date(deposit.created_at).toLocaleDateString('ru-RU');
                const time = new Date(deposit.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const statusEmoji = deposit.status === 'completed' ? '✅' : deposit.status === 'pending' ? '⏳' : '❌';
                const methodName = deposit.payment_method === 'crystalpay' ? 'CrystalPay' : 'CryptoBot';
                
                message += `${statusEmoji} ${formatCurrency(deposit.amount)} ${methodName}\n${date} ${time}\n\n`;
                
                // Добавляем кнопку для просмотра деталей
                keyboard.inline_keyboard.push([
                    { text: `${statusEmoji} ${formatCurrency(deposit.amount)} - ${methodName}`, callback_data: `deposit_details_${deposit.id}` }
                ]);
            });
        }
        
        // Кнопки пагинации
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push({ text: '◀️ Назад', callback_data: `my_deposits_${page - 1}` });
        }
        if (page < totalPages) {
            paginationRow.push({ text: 'Вперед ▶️', callback_data: `my_deposits_${page + 1}` });
        }
        if (paginationRow.length > 0) {
            keyboard.inline_keyboard.push(paginationRow);
        }
        
        keyboard.inline_keyboard.push([
            { text: '🔙 К профилю', callback_data: 'balance' }
        ]);
        
        if (messageId) {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    } catch (error) {
        console.error('My deposits handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

// История обменов с пагинацией
const handleMyExchanges = async (bot, chatId, userId, page = 1, messageId = null) => {
    try {
        const limit = 5;
        const offset = (page - 1) * limit;
        
        // Получаем покупки пользователя
        const allExchanges = await storage.getUserTransactionsByType(userId, 'purchase');
        const totalCount = allExchanges.length;
        const exchanges = allExchanges.slice(offset, offset + limit);
        
        const totalPages = Math.ceil(totalCount / limit);
        
        let message = `💎 *Мои обмены*\n\nСтраница ${page} из ${totalPages}\nВсего обменов: ${totalCount}\n\n`;
        
        const keyboard = { inline_keyboard: [] };
        
        if (exchanges.length === 0) {
            message += '📭 У вас пока нет обменов';
        } else {
            exchanges.forEach((exchange, index) => {
                const date = new Date(exchange.created_at).toLocaleDateString('ru-RU');
                const time = new Date(exchange.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                const statusEmoji = exchange.status === 'completed' ? '✅' : exchange.status === 'pending' ? '⏳' : '❌';
                
                message += `${statusEmoji} ${formatCurrency(exchange.amount)} → TRX\n${date} ${time}\n\n`;
                
                // Добавляем кнопку для просмотра деталей
                keyboard.inline_keyboard.push([
                    { text: `${statusEmoji} ${formatCurrency(exchange.amount)} → TRX`, callback_data: `exchange_details_${exchange.id}` }
                ]);
            });
        }
        
        // Кнопки пагинации
        const paginationRow = [];
        if (page > 1) {
            paginationRow.push({ text: '◀️ Назад', callback_data: `my_exchanges_${page - 1}` });
        }
        if (page < totalPages) {
            paginationRow.push({ text: 'Вперед ▶️', callback_data: `my_exchanges_${page + 1}` });
        }
        if (paginationRow.length > 0) {
            keyboard.inline_keyboard.push(paginationRow);
        }
        
        keyboard.inline_keyboard.push([
            { text: '🔙 К профилю', callback_data: 'balance' }
        ]);
        
        if (messageId) {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    } catch (error) {
        console.error('My exchanges handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

// Детали пополнения
const handleDepositDetails = async (bot, chatId, userId, transactionId, messageId = null) => {
    try {
        const transaction = await storage.getTransaction(transactionId);
        
        if (!transaction || transaction.telegram_id !== userId.toString() || transaction.type !== 'deposit') {
            await bot.sendMessage(chatId, '❌ Транзакция не найдена');
            return;
        }
        
        const date = new Date(transaction.created_at).toLocaleDateString('ru-RU');
        const time = new Date(transaction.created_at).toLocaleTimeString('ru-RU');
        const statusEmoji = transaction.status === 'completed' ? '✅' : transaction.status === 'pending' ? '⏳' : '❌';
        const statusText = transaction.status === 'completed' ? 'Завершено' : transaction.status === 'pending' ? 'В ожидании' : 'Отменено';
        const methodName = transaction.payment_method === 'crystalpay' ? 'CrystalPay' : 'CryptoBot';
        
        const details = createTreeStructure([
            `Сумма: ${formatCurrency(transaction.amount)}`,
            `Способ: ${methodName}`,
            `Статус: ${statusEmoji} ${statusText}`,
            `Дата: ${date}`,
            `Время: ${time}`,
            `ID транзакции: #${transaction.id}`
        ]);
        
        const message = `💳 *Детали пополнения*\n${details}`;
        
        const keyboard = {
            inline_keyboard: [
                [{ text: '🔙 К пополнениям', callback_data: 'my_deposits_1' }],
                [{ text: '🏠 К профилю', callback_data: 'balance' }]
            ]
        };
        
        if (messageId) {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    } catch (error) {
        console.error('Deposit details handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

// Детали обмена
const handleExchangeDetails = async (bot, chatId, userId, transactionId, messageId = null) => {
    try {
        const transaction = await storage.getTransaction(transactionId);
        
        if (!transaction || transaction.telegram_id !== userId.toString() || transaction.type !== 'purchase') {
            await bot.sendMessage(chatId, '❌ Транзакция не найдена');
            return;
        }
        
        const date = new Date(transaction.created_at).toLocaleDateString('ru-RU');
        const time = new Date(transaction.created_at).toLocaleTimeString('ru-RU');
        const statusEmoji = transaction.status === 'completed' ? '✅' : transaction.status === 'pending' ? '⏳' : '❌';
        const statusText = transaction.status === 'completed' ? 'Завершено' : transaction.status === 'pending' ? 'В ожидании' : 'Отменено';
        
        // Парсим метаданные для получения деталей
        let metadata = {};
        try {
            metadata = JSON.parse(transaction.metadata || '{}');
        } catch (e) {
            metadata = {};
        }
        
        const details = createTreeStructure([
            `Потрачено: ${formatCurrency(transaction.amount)}`,
            `Получено TRX: ${metadata.trx_amount || 'Не указано'}`,
            `Кошелек: ${transaction.wallet_address || 'Не указан'}`,
            `Статус: ${statusEmoji} ${statusText}`,
            `Дата: ${date}`,
            `Время: ${time}`,
            `ID транзакции: #${transaction.id}`
        ]);
        
        const message = `💎 *Детали обмена*\n${details}`;
        
        const keyboard = {
            inline_keyboard: [
                [{ text: '🔙 К обменам', callback_data: 'my_exchanges_1' }],
                [{ text: '🏠 К профилю', callback_data: 'balance' }]
            ]
        };
        
        if (messageId) {
            await bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    } catch (error) {
        console.error('Exchange details handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

module.exports = {
    handleBalance,
    handleTopup,
    handleTopupWithAmount,
    handlePaymentMethod,
    handleTopupAmountInput,
    handleCheckPayment,
    handleCancelTopup,
    handleConfirmCancelTopup,
    handleMyDeposits,
    handleMyExchanges,
    handleDepositDetails,
    handleExchangeDetails
};