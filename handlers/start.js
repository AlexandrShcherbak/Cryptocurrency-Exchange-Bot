const { createTreeStructure } = require('../utils/helpers');

const handleStart = async (bot, msg, messageId = null) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'Пользователь';

    const bannerText = `🚀 *AiogramExchange*

Добро пожаловать, ${firstName}! ✨

💎 Быстрый и надежный обмен TRX
🔒 Безопасные транзакции  
⚡ Мгновенные переводы
📊 Актуальные курсы

━━━━━━━━━━━━━━━━━━━━━
Выберите действие:`;

    const keyboard = {
        inline_keyboard: [
            [
                { text: '💰 Купить TRX', callback_data: 'buy_trx' },
                { text: '💳 Баланс', callback_data: 'balance' }
            ],
            [
                { text: '🧮 Калькулятор', callback_data: 'calculator' },
                { text: '🏦 Резерв', callback_data: 'reserve' }
            ]
        ]
    };

    if (messageId) {
        try {
            await bot.editMessageText(bannerText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            const sentMessage = await bot.sendMessage(chatId, bannerText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            // Don't need to store messageId for start handler
        }
    } else {
        const sentMessage = await bot.sendMessage(chatId, bannerText, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        // Don't need to store messageId for start handler
    }
};

module.exports = {
    handleStart
};
