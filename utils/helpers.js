const formatNumber = (number, decimals = 2) => {
    return Number(number).toLocaleString('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};

const normalizeNumericInput = (value) => {
    if (value === null || value === undefined) return '';
    return value
        .toString()
        .trim()
        .replace(/\s+/g, '')
        .replace(',', '.');
};

const parseNumericInput = (value) => {
    const normalized = normalizeNumericInput(value);
    const num = parseFloat(normalized);

    if (Number.isNaN(num) || !Number.isFinite(num)) {
        return null;
    }

    return num;
};

const roundTo = (value, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
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
    const num = parseNumericInput(amount);
    if (num === null || num < min) {
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
    normalizeNumericInput,
    parseNumericInput,
    roundTo,
    validateAmount,
    sleep
};
