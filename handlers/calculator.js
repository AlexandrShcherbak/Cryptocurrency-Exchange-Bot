const { formatCurrency, formatTRX, validateAmount, parseNumericInput } = require('../utils/helpers');
const ratesService = require('../services/rates');

const handleCalculator = async (bot, chatId, userId, userStates, messageId = null) => {
    try {
        const message = `🧮 *Калькулятор валют*

Выберите режим калькулятора:

🔹 Конвертировать Рубли → TRX
🔹 Конвертировать TRX → Рубли
🔹 Посмотреть текущий курс`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💰 Рубли → TRX', callback_data: 'calc_rub_to_trx' }
                ],
                [
                    { text: '💎 TRX → Рубли', callback_data: 'calc_trx_to_rub' }
                ],
                [
                    { text: '📊 Текущий курс', callback_data: 'calc_current_rate' }
                ],
                [
                    { text: '🔙 Назад в меню', callback_data: 'main_menu' }
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
        console.error('Calculator handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

const handleCalcCurrentRate = async (bot, chatId, messageId = null) => {
    try {
        const rateDetails = await ratesService.getRateDetails();
        const updatedAt = new Date(rateDetails.updatedAt).toLocaleString('ru-RU');

        const message = `📊 *Текущий курс TRX*

Курс продажи: ${formatCurrency(rateDetails.rate)}
Наценка: ${rateDetails.markupPercentage}%
Источник USD/RUB: ${rateDetails.source}
Обновлено: ${updatedAt}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Обновить курс', callback_data: 'calc_current_rate_refresh' }
                ],
                [
                    { text: '🔙 К калькулятору', callback_data: 'calculator' }
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
        console.error('Calc current rate handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Не удалось получить текущий курс');
    }
};

const handleCalcCurrentRateRefresh = async (bot, chatId, messageId = null) => {
    try {
        await ratesService.getTRXRateInRUB(true);
        await handleCalcCurrentRate(bot, chatId, messageId);
    } catch (error) {
        console.error('Calc current rate refresh handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Не удалось обновить текущий курс');
    }
};

const handleCalcRubToTrx = async (bot, chatId, userId, userStates, messageId = null) => {
    try {
        userStates.set(userId, {
            step: 'waiting_rub_amount_calc',
            messageId: messageId
        });

        const message = `💰 *Конвертация Рубли → TRX*

Введите сумму в рублях для конвертации:`;

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Назад', callback_data: 'calculator' }
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
                userState.messageId = sentMessage.message_id;
                userStates.set(userId, userState);
            }
        } else {
            const sentMessage = await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            const userState = userStates.get(userId);
            userState.messageId = sentMessage.message_id;
            userStates.set(userId, userState);
        }
    } catch (error) {
        console.error('Calc rub to trx handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

const handleCalcTrxToRub = async (bot, chatId, userId, userStates, messageId = null) => {
    try {
        userStates.set(userId, {
            step: 'waiting_trx_amount_calc',
            messageId: messageId
        });

        const message = `💎 *Конвертация TRX → Рубли*

Введите количество TRX для конвертации:`;

        const keyboard = {
            inline_keyboard: [[
                { text: '🔙 Назад', callback_data: 'calculator' }
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
                userState.messageId = sentMessage.message_id;
                userStates.set(userId, userState);
            }
        } else {
            const sentMessage = await bot.sendMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            const userState = userStates.get(userId);
            userState.messageId = sentMessage.message_id;
            userStates.set(userId, userState);
        }
    } catch (error) {
        console.error('Calc trx to rub handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка');
    }
};

const handleRubAmountCalcInput = async (bot, chatId, userId, amountText, userStates) => {
    try {
        const userState = userStates.get(userId);
        if (!userState || userState.step !== 'waiting_rub_amount_calc') return;

        const amount = validateAmount(amountText, 1);

        if (!amount) {
            await bot.sendMessage(chatId, '❌ Неверная сумма\nВведите корректную сумму в рублях:');
            return;
        }

        const trxRate = await ratesService.getTRXRateInRUB();
        const trxAmount = await ratesService.convertRubToTrx(amount);

        const message = `💰 *Результат конвертации*

Сумма в рублях: ${formatCurrency(amount)}
Курс TRX: ${formatCurrency(trxRate)}
Итого TRX: ${formatTRX(trxAmount)}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Новый расчет', callback_data: 'calculator' },
                    { text: '💰 Купить TRX', callback_data: 'buy_trx' }
                ],
                [
                    { text: '🔙 Главное меню', callback_data: 'main_menu' }
                ]
            ]
        };

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        userStates.delete(userId);
    } catch (error) {
        console.error('Rub amount calc input handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при расчете');
    }
};

const handleTrxAmountCalcInput = async (bot, chatId, userId, amountText, userStates) => {
    try {
        const userState = userStates.get(userId);
        if (!userState || userState.step !== 'waiting_trx_amount_calc') return;

        const trxAmount = parseNumericInput(amountText);

        if (!trxAmount || trxAmount <= 0) {
            await bot.sendMessage(chatId, '❌ Неверное количество TRX\nВведите корректное количество:');
            return;
        }

        const trxRate = await ratesService.getTRXRateInRUB();
        const rubAmount = await ratesService.convertTrxToRub(trxAmount);

        const message = `💎 *Результат конвертации*

Количество TRX: ${formatTRX(trxAmount)}
Курс TRX: ${formatCurrency(trxRate)}
Итого рублей: ${formatCurrency(rubAmount)}`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Новый расчет', callback_data: 'calculator' },
                    { text: '💰 Купить TRX', callback_data: 'buy_trx' }
                ],
                [
                    { text: '🔙 Главное меню', callback_data: 'main_menu' }
                ]
            ]
        };

        await bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        userStates.delete(userId);
    } catch (error) {
        console.error('Trx amount calc input handler error:', error.message);
        await bot.sendMessage(chatId, '❌ Произошла ошибка при расчете');
    }
};

module.exports = {
    handleCalculator,
    handleCalcCurrentRate,
    handleCalcCurrentRateRefresh,
    handleCalcRubToTrx,
    handleCalcTrxToRub,
    handleRubAmountCalcInput,
    handleTrxAmountCalcInput
};
