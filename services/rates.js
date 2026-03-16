const axios = require('axios');
const config = require('../config.json');

class RatesService {
    constructor() {
        this.cachedSellRate = null;
        this.cachedBaseRate = null;
        this.lastUpdate = 0;
        this.updateInterval = config.rate_update_interval || 300000; // 5 minutes
        this.lastSource = null;
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
                    this.lastSource = provider.name;
                    return rate;
                }
            } catch (error) {
                console.warn(`USD/RUB provider failed (${provider.name}):`, error.message);
            }
        }

        throw new Error('All USD/RUB providers failed');
    }

    async fetchTrxToUsdRate() {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd', { timeout: 8000 });
        const trxUsd = response.data?.tron?.usd;

        if (typeof trxUsd !== 'number' || !Number.isFinite(trxUsd) || trxUsd <= 0) {
            throw new Error('Invalid TRX/USD response from CoinGecko');
        }

        return trxUsd;
    }

    async getTRXRateInRUB(forceRefresh = false) {
        const now = Date.now();

        if (!forceRefresh && this.cachedRate && (now - this.lastUpdate) < this.updateInterval) {
            return this.cachedRate;
        }

        try {
            const trxUsd = await this.fetchTrxToUsdRate();
            const usdToRub = await this.fetchUsdToRubRate();

            const baseRate = trxUsd * usdToRub;
            const markupMultiplier = 1 + (config.markup_percentage / 100);
            const finalRate = this.roundTo(baseRate * markupMultiplier, 2);

            this.cachedRate = finalRate;
            this.lastUpdate = now;

            global.currentTrxRate = finalRate;

            console.log(`TRX rate updated: ${finalRate} ₽ (source: ${this.lastSource || 'unknown'})`);
            return finalRate;
        } catch (error) {
            console.error('Rate fetch error:', error.message);

            if (this.cachedRate) {
                return this.cachedRate;
            }

            return 33.0;
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

    async getRateDetails(forceRefresh = false) {
        const rate = await this.getTRXRateInRUB(forceRefresh);
        return {
            rate,
            markupPercentage: config.markup_percentage,
            updatedAt: this.lastUpdate || Date.now(),
            source: this.lastSource || 'cache'
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
