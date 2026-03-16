const axios = require('axios');
const config = require('../config.json');

class RatesService {
    constructor() {
        this.cachedSellRate = null;
        this.cachedBaseRate = null;
        this.lastUpdate = 0;
        this.updateInterval = config.rate_update_interval || 300000; // 5 minutes
        this.lastSource = {
            trxUsd: null,
            usdRub: null
        };
    }

    roundTo(value, decimals) {
        const factor = 10 ** decimals;
        return Math.round(value * factor) / factor;
    }

    async fetchUsdToRubRate() {
        const providers = [
            {
                name: 'exchangerate-api',
                url: 'https://api.exchangerate-api.com/v4/latest/USD',
                parser: (data) => data?.rates?.RUB
            },
            {
                name: 'open.er-api',
                url: 'https://open.er-api.com/v6/latest/USD',
                parser: (data) => data?.rates?.RUB
            }
        ];

        for (const provider of providers) {
            try {
                const response = await axios.get(provider.url, { timeout: 8000 });
                const rate = provider.parser(response.data);
                if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
                    this.lastSource.usdRub = provider.name;
                    return rate;
                }
            } catch (error) {
                console.warn(`USD/RUB provider failed (${provider.name}):`, error.message);
            }
        }

        throw new Error('All USD/RUB providers failed');
    }

    async fetchTrxToUsdRate() {
        const providers = [
            {
                name: 'coingecko',
                url: 'https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd',
                parser: (data) => data?.tron?.usd
            },
            {
                name: 'cryptocompare',
                url: 'https://min-api.cryptocompare.com/data/price?fsym=TRX&tsyms=USD',
                parser: (data) => data?.USD
            }
        ];

        for (const provider of providers) {
            try {
                const response = await axios.get(provider.url, { timeout: 8000 });
                const rate = provider.parser(response.data);
                if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
                    this.lastSource.trxUsd = provider.name;
                    return rate;
                }
            } catch (error) {
                console.warn(`TRX/USD provider failed (${provider.name}):`, error.message);
            }
        }

        throw new Error('All TRX/USD providers failed');
    }

    async refreshRates() {
        const trxUsd = await this.fetchTrxToUsdRate();
        const usdToRub = await this.fetchUsdToRubRate();

        const baseRate = this.roundTo(trxUsd * usdToRub, 4);
        const markupMultiplier = 1 + (config.markup_percentage / 100);
        const sellRate = this.roundTo(baseRate * markupMultiplier, 2);

        this.cachedBaseRate = baseRate;
        this.cachedSellRate = sellRate;
        this.lastUpdate = Date.now();
        global.currentTrxRate = sellRate;

        console.log(`TRX rate updated: ${sellRate} ₽ (TRX/USD: ${this.lastSource.trxUsd}, USD/RUB: ${this.lastSource.usdRub})`);

        return {
            baseRate,
            sellRate
        };
    }

    async getTRXRateInRUB(forceRefresh = false) {
        const now = Date.now();

        if (!forceRefresh && this.cachedSellRate && (now - this.lastUpdate) < this.updateInterval) {
            return this.cachedSellRate;
        }

        try {
            const rates = await this.refreshRates();
            return rates.sellRate;
        } catch (error) {
            console.error('Rate fetch error:', error.message);

            if (this.cachedSellRate) {
                return this.cachedSellRate;
            }

            return 33.0;
        }
    }

    async getBaseTRXRateInRUB(forceRefresh = false) {
        const now = Date.now();

        if (!forceRefresh && this.cachedBaseRate && (now - this.lastUpdate) < this.updateInterval) {
            return this.cachedBaseRate;
        }

        try {
            const rates = await this.refreshRates();
            return rates.baseRate;
        } catch (error) {
            console.error('Base rate fetch error:', error.message);

            if (this.cachedBaseRate) {
                return this.cachedBaseRate;
            }

            const sellRate = await this.getTRXRateInRUB(false);
            return this.roundTo(sellRate / (1 + (config.markup_percentage / 100)), 4);
        }
    }

    async convertRubToTrx(rubAmount, forceRefresh = false) {
        const rate = await this.getTRXRateInRUB(forceRefresh);
        return this.roundTo(rubAmount / rate, 6);
    }

    async convertTrxToRub(trxAmount, forceRefresh = false) {
        const rate = await this.getTRXRateInRUB(forceRefresh);
        return this.roundTo(trxAmount * rate, 2);
    }

    async estimatePurchasePlan(rubAmount, forceRefresh = false) {
        const sellRate = await this.getTRXRateInRUB(forceRefresh);
        const baseRate = await this.getBaseTRXRateInRUB(false);

        const trxAmount = this.roundTo(rubAmount / sellRate, 6);
        const trxAtMarket = this.roundTo(rubAmount / baseRate, 6);
        const lostTrxToMarkup = this.roundTo(Math.max(0, trxAtMarket - trxAmount), 6);
        const marketRubValue = this.roundTo(trxAmount * baseRate, 2);
        const markupRub = this.roundTo(Math.max(0, rubAmount - marketRubValue), 2);

        return {
            rubAmount: this.roundTo(rubAmount, 2),
            sellRate,
            baseRate,
            markupPercentage: config.markup_percentage,
            trxAmount,
            trxAtMarket,
            lostTrxToMarkup,
            markupRub
        };
    }

    async getRateDetails(forceRefresh = false) {
        const rate = await this.getTRXRateInRUB(forceRefresh);
        const baseRate = await this.getBaseTRXRateInRUB(false);

        return {
            rate,
            baseRate,
            markupPercentage: config.markup_percentage,
            updatedAt: this.lastUpdate || Date.now(),
            source: {
                trxUsd: this.lastSource.trxUsd || 'cache',
                usdRub: this.lastSource.usdRub || 'cache'
            }
        };
    }

    async calculateTRXAmount(rubAmount) {
        return this.convertRubToTrx(rubAmount);
    }

    async calculateRubAmount(trxAmount) {
        return this.convertTrxToRub(trxAmount);
    }
}

module.exports = new RatesService();
