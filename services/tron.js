const axios = require('axios');

class TronService {
    constructor() {
        this.baseUrl = 'https://api.trongrid.io';
    }

    async validateAddress(address) {
        try {
            const response = await axios.post(`${this.baseUrl}/wallet/validateaddress`, {
                address: address
            });
            
            return response.data && response.data.result === true;
        } catch (error) {
            console.error('TRX address validation error:', error.message);
            return false;
        }
    }

    async getAccountInfo(address) {
        try {
            const response = await axios.post(`${this.baseUrl}/v1/accounts/${address}`);
            return response.data;
        } catch (error) {
            console.error('TRX account info error:', error.message);
            return null;
        }
    }

    shortenAddress(address) {
        if (!address || address.length <= 10) return address;
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    getTronScanUrl(address) {
        return `https://tronscan.io/#/address/${address}`;
    }

    formatAddressWithLink(address) {
        const shortened = this.shortenAddress(address);
        const url = this.getTronScanUrl(address);
        return `[${shortened}](${url})`;
    }
}

module.exports = new TronService();
