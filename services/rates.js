const axios = require('axios');
const config = require('../config.json');

class RatesService {
    constructor() {
        this.cachedRate = null;
        this.lastUpdate = 0;
        this.updateInterval = config.rate_update_interval || 300000; // 5 minutes
    }

    async getTRXRateInRUB() {
        const now = Date.now();
        
        // Return cached rate if still valid
        if (this.cachedRate && (now - this.lastUpdate) < this.updateInterval) {
            return this.cachedRate;
        }

        try {
            // Get TRX rate in USD from CoinGecko
            const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd');
            const trxUsd = response.data.tron.usd;

            // Get USD to RUB rate
            const rubResponse = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
            const usdToRub = rubResponse.data.rates.RUB;

            // Calculate TRX in RUB
            const trxRub = trxUsd * usdToRub;

            // Apply markup
            const markupMultiplier = 1 + (config.markup_percentage / 100);
            const finalRate = trxRub * markupMultiplier;

            // Round to 2 decimal places (hundredths)
            this.cachedRate = Math.round(finalRate * 100) / 100;
            this.lastUpdate = now;
            
            // Store globally for calculator
            global.currentTrxRate = this.cachedRate;

            console.log(`TRX rate updated: ${this.cachedRate} ₽`);
            return this.cachedRate;
        } catch (error) {
            console.error('Rate fetch error:', error.message);
            
            // Return cached rate if available, otherwise default
            if (this.cachedRate) {
                return this.cachedRate;
            }
            
            // Fallback rate
            return 33.0;
        }
    }

    async calculateTRXAmount(rubAmount) {
        const rate = await this.getTRXRateInRUB();
        return Math.floor((rubAmount / rate) * 1000000) / 1000000; // Round to 6 decimal places
    }

    async calculateRubAmount(trxAmount) {
        const rate = await this.getTRXRateInRUB();
        return Math.round(trxAmount * rate * 100) / 100; // Round to 2 decimal places
    }
}

module.exports = new RatesService();
