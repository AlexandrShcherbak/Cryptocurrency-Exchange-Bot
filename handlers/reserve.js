const { formatCurrency, formatTRX } = require('../utils/formatters');
const ratesService = require('../services/rates');
const { storage } = require('../server/storage');

const handleReserve = async (bot, chatId, userId, messageId = null) => {
    try {
        const reserveAmount = await storage.getReserve();
        const currentRate = await ratesService.getTRXRateInRUB();
        const reserveInRub = reserveAmount * currentRate;

        const message = `🏦 *Резерв обменника*\n\n` +
            `💎 Доступно TRX: ${formatTRX(reserveAmount)}\n` +
            `💰 Стоимость: ${formatCurrency(reserveInRub)}`;

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
        console.error('Reserve handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при получении информации о резерве');
    }
};

module.exports = {
    handleReserve
};