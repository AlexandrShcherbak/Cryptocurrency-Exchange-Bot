const axios = require('axios');
const crypto = require('crypto');
const config = require('../config.json');

class PaymentsService {
    constructor() {
        this.crystalPayLogin = config.crystalpay.auth_login;
        this.crystalPaySecret = config.crystalpay.auth_secret;
        this.crystalPaySalt = config.crystalpay.salt;
        this.cryptoBotToken = process.env.CRYPTOBOT_TOKEN || config.cryptobot.token;
        this.callbackUrl = config.callback_url;
        
        console.log('💳 Payment service initialized:');
        console.log('- CrystalPay login:', this.crystalPayLogin ? 'configured' : 'missing');
        console.log('- CrystalPay secret:', this.crystalPaySecret ? 'configured' : 'missing');
        console.log('- CryptoBot token:', this.cryptoBotToken ? `${this.cryptoBotToken.substring(0, 10)}...` : 'missing');
        console.log('- Callback URL:', this.callbackUrl);
    }

    // Get USD exchange rate
    async getUSDRate() {
        try {
            const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
            return response.data.rates.RUB || 100; // Fallback to 100 if rate not available
        } catch (error) {
            console.error('USD rate fetch error:', error.message);
            return 100; // Fallback rate
        }
    }

    // CrystalPay v3 API integration
    async createCrystalPayInvoice(rubAmount, description, userId) {
        try {
            console.log('Creating CrystalPay v3 invoice...');
            
            // CrystalPay v3 supports RUB directly
            const data = {
                auth_login: this.crystalPayLogin,
                auth_secret: this.crystalPaySecret,
                amount: rubAmount,
                amount_currency: "RUB", // Используем RUB напрямую
                type: "purchase", 
                lifetime: 60,
                description: description,
                extra: `user_${userId}`,
                callback_url: this.callbackUrl
            };

            console.log('CrystalPay v3 request data:', JSON.stringify(data, null, 2));

            const response = await axios.post('https://api.crystalpay.io/v3/invoice/create/', data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log('CrystalPay v3 response:', JSON.stringify(response.data, null, 2));

            if (response.data && response.data.url) {
                return {
                    success: true,
                    invoice_id: response.data.id.toString(),
                    url: response.data.url
                };
            } else if (response.data && response.data.errors) {
                throw new Error(response.data.errors.join(', '));
            } else {
                throw new Error('Unknown CrystalPay error');
            }
        } catch (error) {
            console.error('CrystalPay error:', error.response?.data || error.message);
            const errorMsg = error.response?.data?.errors ? error.response.data.errors.join(', ') : 
                           (error.response?.data?.error || error.message);
            return {
                success: false,
                error: errorMsg
            };
        }
    }

    // Crypto Pay API integration (updated)
    async createCryptoBotInvoice(rubAmount, description, userId) {
        try {
            console.log('Creating Crypto Pay invoice...');
            
            // Получаем актуальный токен
            const currentToken = process.env.CRYPTOBOT_TOKEN || this.cryptoBotToken;
            console.log('Using token:', currentToken ? `${currentToken.substring(0, 10)}...` : 'MISSING');
            
            if (!currentToken) {
                throw new Error('CRYPTOBOT_TOKEN not configured');
            }
            
            // Crypto Pay API - создаем инвойс в рублях с автоконвертацией
            const data = {
                currency_type: 'fiat',
                fiat: 'RUB', 
                amount: rubAmount,
                description: description,
                expires_in: 3600,
                accepted_assets: 'USDT,BTC,ETH,TON,BNB' // Принимаем популярные валюты
            };

            console.log('Crypto Pay request data:', JSON.stringify(data, null, 2));

            const response = await axios.post('https://pay.crypt.bot/api/createInvoice', data, {
                headers: {
                    'Crypto-Pay-API-Token': currentToken,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Crypto Pay response:', JSON.stringify(response.data, null, 2));

            if (response.data.ok && response.data.result) {
                return {
                    success: true,
                    invoice_id: response.data.result.invoice_id.toString(),
                    url: response.data.result.bot_invoice_url || response.data.result.pay_url
                };
            } else {
                const errorMsg = response.data.error?.name || response.data.error || 'Unknown Crypto Pay error';
                throw new Error(errorMsg);
            }
        } catch (error) {
            console.error('Crypto Pay error:', error.response?.data || error.message);
            const errorMsg = error.response?.data?.error?.name || error.response?.data?.error || error.message;
            return {
                success: false,
                error: errorMsg
            };
        }
    }

    async checkCrystalPayInvoice(invoiceId) {
        try {
            const data = {
                auth_login: this.crystalPayLogin,
                auth_secret: this.crystalPaySecret,
                id: invoiceId
            };

            console.log('🔍 CrystalPay check request:', JSON.stringify(data, null, 2));

            const response = await axios.post('https://api.crystalpay.io/v3/invoice/info/', data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('📋 CrystalPay check response:', JSON.stringify(response.data, null, 2));
            
            if (response.data && !response.data.error) {
                console.log(`💰 CrystalPay invoice status: "${response.data.state}" for invoice ${invoiceId}`);
                return {
                    success: true,
                    status: response.data.state,
                    amount: response.data.amount
                };
            }
            
            console.log(`❌ CrystalPay error response:`, response.data);
            return { success: false };
        } catch (error) {
            console.error('❌ CrystalPay check error:', error.response?.data || error.message);
            return { success: false };
        }
    }

    async checkCryptoBotInvoice(invoiceId) {
        try {
            console.log(`🔍 CryptoBotPay check request for invoice: ${invoiceId}`);
            
            const response = await axios.get(`https://pay.crypt.bot/api/getInvoices?invoice_ids=${invoiceId}`, {
                headers: {
                    'Crypto-Pay-API-Token': this.cryptoBotToken
                }
            });

            console.log('📋 CryptoBotPay check response:', JSON.stringify(response.data, null, 2));

            if (response.data.ok && response.data.result.items.length > 0) {
                const invoice = response.data.result.items[0];
                console.log(`💰 CryptoBotPay invoice status: "${invoice.status}" for invoice ${invoiceId}`);
                return {
                    success: true,
                    status: invoice.status,
                    amount: invoice.amount || invoice.paid_amount
                };
            }
            
            console.log(`❌ CryptoBotPay no invoice found or empty result`);
            return { success: false };
        } catch (error) {
            console.error('❌ CryptoBotPay check error:', error.response?.data || error.message);
            return { success: false };
        }
    }
}

module.exports = new PaymentsService();
