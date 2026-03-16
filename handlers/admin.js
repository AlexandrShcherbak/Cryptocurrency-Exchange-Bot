const { formatCurrency, formatTRX } = require('../utils/formatters');
const { validateAmount } = require('../utils/helpers');
const ratesService = require('../services/rates');
const { storage } = require('../server/storage');
const { getDatabaseConfig } = require('../server/db.js');
const config = require('../config.json');

const handleAdmin = async (bot, chatId, userId, userStates, messageId = null) => {
    try {
        // Check if user is admin
        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ панели');
            return;
        }

        const reserveAmount = await storage.getReserve();
        const currentRate = await ratesService.getTRXRateInRUB();

        const dbConfig = getDatabaseConfig();
        const message = `🔧 *Админ панель*\n\n` +
            `🏦 Текущий резерв: ${formatTRX(reserveAmount)}\n` +
            `💰 Курс TRX: ${formatCurrency(currentRate)}\n` +
            `🗄️ База данных: ${dbConfig.database}@${dbConfig.host}\n\n` +
            `Выберите действие:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '➕ Добавить резерв', callback_data: 'admin_add_reserve' },
                    { text: '💳 Выдать баланс', callback_data: 'admin_give_balance' }
                ],
                [
                    { text: '📢 Рассылка', callback_data: 'admin_broadcast' }
                ],
                [
                    { text: '🗄️ Статус БД', callback_data: 'admin_db_status' }
                ],
                [
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
        console.error('Admin handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка в админ панели');
    }
};

const handleAddReserve = async (bot, chatId, userId, userStates, messageId = null) => {
    try {
        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ функциям');
            return;
        }

        userStates.set(userId, {
            step: 'waiting_reserve_amount',
            messageId: messageId
        });

        const message = '➕ *Добавление резерва*\n\nВведите количество TRX для добавления в резерв:';

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Админ панель', callback_data: 'admin_panel' }
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
    } catch (error) {
        console.error('Add reserve handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

const handleReserveAmountInput = async (bot, chatId, userId, amountText, userStates) => {
    try {
        const userState = userStates.get(userId);
        if (!userState || userState.step !== 'waiting_reserve_amount') return;

        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ функциям');
            return;
        }

        const amount = validateAmount(amountText, 0);

        if (!amount) {
            await bot.sendMessage(chatId, '❌ Неверное количество\nВведите корректное количество TRX:');
            return;
        }

        const currentReserve = await storage.getReserve();
        const newReserve = currentReserve + amount;
        await storage.updateReserve(newReserve);

        const currentRate = await ratesService.getTRXRateInRUB();
        const addedValueRub = amount * currentRate;

        const message = `✅ *Резерв обновлен*\n\n` +
            `➕ Добавлено: ${formatTRX(amount)}\n` +
            `💰 Стоимость: ${formatCurrency(addedValueRub)}\n` +
            `🏦 Новый резерв: ${formatTRX(newReserve)}`;

        const keyboard = {
            inline_keyboard: [[
                { text: '🔧 Админ панель', callback_data: 'admin_panel' },
                { text: '🔙 Главное меню', callback_data: 'main_menu' }
            ]]
        };

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        userStates.delete(userId);
    } catch (error) {
        console.error('Reserve amount input error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при обновлении резерва');
    }
};

const handleGiveBalance = async (bot, chatId, userId, userStates, messageId = null) => {
    try {
        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ функциям');
            return;
        }

        userStates.set(userId, {
            step: 'waiting_user_id_for_balance',
            messageId: messageId
        });

        const message = '💳 *Выдача баланса*\n\nВведите ID пользователя (Telegram ID):';

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Админ панель', callback_data: 'admin_panel' }
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
    } catch (error) {
        console.error('Give balance handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

const handleBroadcast = async (bot, chatId, userId, userStates, messageId = null) => {
    try {
        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ функциям');
            return;
        }

        userStates.set(userId, {
            step: 'waiting_broadcast_message',
            messageId: messageId
        });

        const message = '📢 *Рассылка сообщений*\n\nВведите сообщение для рассылки всем пользователям:';

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Админ панель', callback_data: 'admin_panel' }
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
    } catch (error) {
        console.error('Broadcast handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

const handleBroadcastMessageInput = async (bot, chatId, userId, text, userStates) => {
    try {
        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ функциям');
            return;
        }

        // Get all users for broadcast
        const users = await storage.getAllUsers();
        let successCount = 0;
        let errorCount = 0;

        // Confirmation message first
        const confirmMessage = `📢 *Подтверждение рассылки*\n\n` +
            `Сообщение: "${text}"\n` +
            `Количество получателей: ${users.length}\n\n` +
            `Отправить рассылку всем пользователям?`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ Отправить', callback_data: `confirm_broadcast:${Buffer.from(text).toString('base64')}` },
                    { text: '❌ Отмена', callback_data: 'admin_panel' }
                ]
            ]
        };

        const userState = userStates.get(userId);
        if (userState && userState.messageId) {
            try {
                await bot.editMessageText(confirmMessage, {
                    chat_id: chatId,
                    message_id: userState.messageId,
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } catch (error) {
                await bot.sendMessage(chatId, confirmMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }
        } else {
            await bot.sendMessage(chatId, confirmMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }

        userStates.delete(userId);
    } catch (error) {
        console.error('Broadcast message input error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при подготовке рассылки');
        userStates.delete(userId);
    }
};

const handleUserIdForBalanceInput = async (bot, chatId, userId, text, userStates) => {
    try {
        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ функциям');
            return;
        }

        const targetUserId = parseInt(text.trim());
        if (isNaN(targetUserId)) {
            await bot.sendMessage(chatId, '❌ Введите корректный ID пользователя (число)');
            return;
        }

        // Get target user info
        let targetUser;
        try {
            targetUser = await storage.getUser(targetUserId);
        } catch (error) {
            console.error('Error getting user:', error);
            await bot.sendMessage(chatId, '❌ Пользователь не найден в базе данных');
            return;
        }

        if (!targetUser) {
            await bot.sendMessage(chatId, '❌ Пользователь не найден');
            return;
        }

        userStates.set(userId, {
            step: 'waiting_balance_amount',
            targetUserId: targetUserId,
            messageId: userStates.get(userId)?.messageId
        });

        // Get user info from Telegram API to get username
        let username = 'Unknown';
        try {
            const chatMember = await bot.getChatMember(targetUserId, targetUserId);
            username = chatMember.user.username || chatMember.user.first_name || 'Unknown';
        } catch (error) {
            console.log('Could not get username from Telegram API');
        }

        const message = `💳 *Выдача баланса*\n\nПользователь: @${username} (ID: ${targetUserId})\nТекущий баланс: ${formatCurrency(targetUser.balance)}\n\nВведите сумму для выдачи (в рублях):`;

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Админ панель', callback_data: 'admin_panel' }
            ]]
        };

        const userState = userStates.get(userId);
        if (userState && userState.messageId) {
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
                userStates.set(userId, { ...userState, messageId: sentMessage.message_id });
            }
        } else {
            const sentMessage = await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            userStates.set(userId, { ...userState, messageId: sentMessage.message_id });
        }
    } catch (error) {
        console.error('User ID input error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
        userStates.delete(userId);
    }
};

const handleBalanceAmountInput = async (bot, chatId, userId, text, userStates) => {
    try {
        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ функциям');
            return;
        }

        const amount = parseFloat(text.replace(',', '.'));
        if (isNaN(amount) || amount <= 0) {
            await bot.sendMessage(chatId, '❌ Введите корректную сумму (положительное число)');
            return;
        }

        const userState = userStates.get(userId);
        const targetUserId = userState.targetUserId;

        // Update user balance
        const updatedUser = await storage.updateUserBalance(targetUserId, amount);
        if (!updatedUser) {
            await bot.sendMessage(chatId, '❌ Не удалось обновить баланс пользователя');
            return;
        }

        // Add transaction record
        const transaction = await storage.addTransaction(updatedUser.id, 'admin_deposit', amount, {
            admin_id: userId,
            reason: 'Выдача баланса администратором'
        });

        await storage.updateTransactionStatus(transaction.id, 'completed');

        const message = `✅ *Баланс выдан*\n\n` +
            `Пользователь: ID ${targetUserId}\n` +
            `Выдано: ${formatCurrency(amount)}\n` +
            `Новый баланс: ${formatCurrency(updatedUser.balance)}`;

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Админ панель', callback_data: 'admin_panel' }
            ]]
        };

        if (userState && userState.messageId) {
            try {
                await bot.editMessageText(message, {
                    chat_id: chatId,
                    message_id: userState.messageId,
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

        userStates.delete(userId);
    } catch (error) {
        console.error('Balance amount input error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при выдаче баланса');
        userStates.delete(userId);
    }
};

const handleConfirmBroadcast = async (bot, chatId, userId, broadcastMessage, messageId) => {
    try {
        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ функциям');
            return;
        }

        // Get all users for broadcast
        const users = await storage.getAllUsers();
        let successCount = 0;
        let errorCount = 0;

        // Start broadcasting
        const startMessage = `📢 *Рассылка начата*\n\nОтправка сообщения ${users.length} пользователям...`;

        try {
            await bot.editMessageText(startMessage, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
            });
        } catch (error) {
            await bot.sendMessage(chatId, startMessage, { parse_mode: 'Markdown' });
        }

        // Send to all users
        for (const user of users) {
            try {
                await bot.sendMessage(user.telegram_id, broadcastMessage);
                successCount++;

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error(`Failed to send broadcast to user ${user.telegram_id}:`, error.message);
                errorCount++;
            }
        }

        // Send completion message
        const completionMessage = `✅ *Рассылка завершена*\n\n` +
            `Успешно отправлено: ${successCount}\n` +
            `Ошибок: ${errorCount}\n` +
            `Общий охват: ${users.length}`;

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Админ панель', callback_data: 'admin_panel' }
            ]]
        };

        try {
            await bot.editMessageText(completionMessage, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            await bot.sendMessage(chatId, completionMessage, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }

    } catch (error) {
        console.error('Broadcast confirmation error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при рассылке');
    }
};

const handleDatabaseStatus = async (bot, chatId, userId, userStates, messageId = null) => {
    try {
        if (String(userId) !== String(config.admin_id)) {
            await bot.sendMessage(chatId, '❌ У вас нет доступа к админ функциям');
            return;
        }

        const dbConfig = getDatabaseConfig();

        // Test database connection by getting users count
        let connectionStatus = '✅ Подключена';
        let usersCount = 0;
        let transactionsCount = 0;

        try {
            const users = await storage.getAllUsers();
            usersCount = users.length;

            // Get transactions count (simplified query)
            const recentTransactions = await storage.getUserTransactions(users[0]?.telegram_id || 0, 1);
            // This is a simplified count, in real implementation you'd want a proper count query
        } catch (error) {
            connectionStatus = '❌ Ошибка подключения';
            console.error('Database connection test failed:', error.message);
        }

        // Escape special characters for Telegram markdown
        const hostEscaped = dbConfig.host.replace(/[-._]/g, '\\$&');
        const userEscaped = dbConfig.user.replace(/[-._]/g, '\\$&');
        const dbNameEscaped = dbConfig.database.replace(/[-._]/g, '\\$&');

        const message = `🗄️ *Статус базы данных*\n\n` +
            `📊 Статус подключения: ${connectionStatus}\n` +
            `🏠 Хост: \`${dbConfig.host}\`\n` +
            `🗂️ База данных: \`${dbConfig.database}\`\n` +
            `👤 Пользователь: \`${dbConfig.user}\`\n` +
            `🔌 Порт: ${dbConfig.port}\n` +
            `🔒 SSL: ${dbConfig.ssl ? 'Включен' : 'Отключен'}\n\n` +
            `📈 *Статистика:*\n` +
            `👥 Пользователей: ${usersCount}\n` +
            `💳 Источник конфига: ${config.database ? 'config\\.json' : 'Переменные окружения'}`;

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Админ панель', callback_data: 'admin_panel' }
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
    } catch (error) {
        console.error('Database status handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при получении статуса БД');
    }
};

module.exports = {
    handleAdmin,
    handleAddReserve,
    handleReserveAmountInput,
    handleGiveBalance,
    handleBroadcast,
    handleBroadcastMessageInput,
    handleUserIdForBalanceInput,
    handleBalanceAmountInput,
    handleConfirmBroadcast,
    handleDatabaseStatus
};