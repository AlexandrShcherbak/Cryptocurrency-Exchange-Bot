const formatNumber = (number, decimals = 2) => {
    return Number(number).toLocaleString('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

const formatCurrency = (amount, currency = '₽') => {
    return `${formatNumber(amount)} ${currency}`;
};

const formatTRX = (amount) => {
    return `${formatNumber(amount, 6)} TRX`;
};

const createTreeStructure = (items) => {
    let result = '';
    items.forEach((item, index) => {
        const isLast = index === items.length - 1;
        const prefix = isLast ? '└' : '├';
        result += `${prefix} ${item}\n`;
    });
    return result.trim();
};

const escapeMarkdown = (text) => {
    return text.toString().replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
};

const validateAmount = (amount, min = 0) => {
    const num = parseFloat(amount.toString().replace(',', '.'));
    if (isNaN(num) || num < min) {
        return false;
    }
    return num;
};

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

module.exports = {
    formatNumber,
    formatCurrency,
    formatTRX,
    createTreeStructure,
    escapeMarkdown,
    validateAmount,
    sleep
};
