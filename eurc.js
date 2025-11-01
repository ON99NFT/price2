const EURC = (() => {
    let fundingRateInterval = null;
    let nextFundingTime = null;

    // Fetch MEXC Funding Rate for EURC (EUR_USDT)
    async function fetchMexcFundingRate() {
        const proxyUrl = 'https://api.codetabs.com/v1/proxy/?quest=';
        const url = 'https://contract.mexc.com/api/v1/contract/funding_rate/EUR_USDT';
        
        try {
            const response = await fetch(proxyUrl + url);
            const data = await response.json();
            
            if (!data?.data?.fundingRate) {
                throw new Error('Invalid MEXC funding rate response');
            }
            
            return {
                rate: parseFloat(data.data.fundingRate),
                nextTime: data.data.nextSettleTime
            };
        } catch (error) {
            console.error('MEXC Funding Rate Error:', error);
            return null;
        }
    }

    // Fetch Pyth EUR/USD price
    async function fetchPythEURUSD() {
        // Pyth price feed ID for EUR/USD
        const priceId = '0xa995d00bb36a63cef7fd2c287dc105fc8f3d93779f062f09551b0af3e81ec30b';
        const proxyUrl = 'https://api.codetabs.com/v1/proxy/?quest=';
        
        // Try the new Hermes API endpoint that returns JSON by default
        const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${priceId}&encoding=json`;
        
        try {
            const response = await fetch(proxyUrl + url);
            const data = await response.json();
            
            // Debug: log the full response to see its structure
            console.log('Pyth API Response:', data);
            
            // The structure might be different than expected
            // Let's try multiple possible response formats
            let priceData;
            
            if (data?.parsed) {
                // New format with parsed data
                priceData = data.parsed[0];
            } else if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
                // Alternative format
                priceData = data.data[0];
            } else if (Array.isArray(data) && data.length > 0) {
                // Array format
                priceData = data[0];
            } else {
                throw new Error('Unexpected Pyth response format');
            }
            
            if (!priceData?.price || priceData.price.price === undefined) {
                throw new Error('Invalid Pyth price data');
            }
            
            // Pyth price is in fixed-point representation: price * 10^expo
            const price = parseFloat(priceData.price.price) * Math.pow(10, priceData.price.expo);
            return price;
        } catch (error) {
            console.error('Pyth EUR/USD Error:', error);
            
            // Try alternative API endpoint as fallback
            try {
                const alternativeUrl = `https://benchmarks.pyth.network/v1/valuations/${priceId}`;
                const altResponse = await fetch(proxyUrl + alternativeUrl);
                const altData = await altResponse.json();
                
                if (altData?.price) {
                    return parseFloat(altData.price);
                }
            } catch (fallbackError) {
                console.error('Pyth fallback also failed:', fallbackError);
            }
            
            return null;
        }
    }

    // Update funding rate countdown timer
    function updateFundingCountdown() {
        if (!nextFundingTime) return;
        
        const now = new Date().getTime();
        const diff = nextFundingTime - now;
        
        if (diff <= 0) {
            // Time's up, refresh funding rate
            updateFundingRate();
            return;
        }
        
        // Format the time difference
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        document.getElementById('eurc-next-funding').textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Update funding rate display
    async function updateFundingRate() {
        const fundingElement = document.getElementById('eurc-funding-rate');
        const rateValueElement = fundingElement.querySelector('.funding-rate-value');
        
        try {
            const fundingData = await fetchMexcFundingRate();
            
            if (!fundingData) {
                rateValueElement.textContent = 'Error';
                fundingElement.className = 'funding-rate';
                return;
            }
            
            const rate = fundingData.rate;
            const ratePercent = (rate * 100).toFixed(4);
            
            rateValueElement.textContent = `${ratePercent}%`;
            
            // Set appropriate styling based on rate value
            if (rate > 0.0005) {
                fundingElement.className = 'funding-rate positive';
            } else if (rate < -0.0005) {
                fundingElement.className = 'funding-rate negative';
            } else {
                fundingElement.className = 'funding-rate neutral';
            }
            
            // Set next funding time
            nextFundingTime = parseInt(fundingData.nextTime);
            
            // Start countdown if not already running
            if (!fundingRateInterval) {
                fundingRateInterval = setInterval(updateFundingCountdown, 1000);
            }
            
        } catch (error) {
            console.error('Funding Rate Update Error:', error);
            rateValueElement.textContent = 'Error';
            fundingElement.className = 'funding-rate';
        }
    }

    // Fetch MEXC contract prices
    async function fetchMexcContractPrice() {
        const proxyUrl = 'https://api.codetabs.com/v1/proxy/?quest=';
        const url = 'https://contract.mexc.com/api/v1/contract/depth/EUR_USDT';
        
        try {
            const response = await fetch(proxyUrl + url);
            const data = await response.json();
            
            if (!data?.data?.bids?.[0]?.[0]) throw new Error('Invalid MEXC response');
            
            return {
                bid: parseFloat(data.data.bids[0][0]),
                ask: parseFloat(data.data.asks[0][0])
            };
        } catch (error) {
            console.error('MEXC Contract Error:', error);
            return null;
        }
    }

    // Fetch KyberSwap prices
    async function fetchKyberPrice() {
        const addresses = {
            USDC: '0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913',
            EURC: '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42'
        };

        try {
            // Format amounts properly without scientific notation
            const buyAmount = "11500000000"; // 11500 USDC with 18 decimals
            const sellAmount = "10000000000"; // 10000 EURC with 18 decimals
            
            const [buyResponse, sellResponse] = await Promise.all([
                fetch(`https://aggregator-api.kyberswap.com/base/api/v1/routes?tokenIn=${addresses.USDC}&tokenOut=${addresses.EURC}&amountIn=${buyAmount}&excludedSources=lo1inch,kyberswap-limit-order-v2`),
                fetch(`https://aggregator-api.kyberswap.com/base/api/v1/routes?tokenIn=${addresses.EURC}&tokenOut=${addresses.USDC}&amountIn=${sellAmount}&excludedSources=lo1inch,kyberswap-limit-order-v2`)
            ]);

            const buyData = await buyResponse.json();
            const sellData = await sellResponse.json();
            
            return {
                buyPrice: buyData.data?.routeSummary?.amountOut ? 
                    11500 / (parseFloat(buyData.data.routeSummary.amountOut) / 1e6) : null,
                sellPrice: sellData.data?.routeSummary?.amountOut ? 
                    (parseFloat(sellData.data.routeSummary.amountOut) / 1e6) / 10000 : null
            };
        } catch (error) {
            console.error('Kyber Error:', error);
            return { buyPrice: null, sellPrice: null };
        }
    }

    // Update alerts with pumpfun-like system
    async function updateAlerts() {
        const elements = {
            kyberBuy: document.getElementById('eurc-kyber-buy-alert'),
            kyberSell: document.getElementById('eurc-kyber-sell-alert'),
            kyberPythBuy: document.getElementById('eurc-kyber-pyth-buy-alert'),
            kyberPythSell: document.getElementById('eurc-kyber-pyth-sell-alert')
        };

        try {
            const [kyberData, contractData, pythPrice] = await Promise.all([
                fetchKyberPrice(),
                fetchMexcContractPrice(),
                fetchPythEURUSD()
            ]);
            
            // Formatting helper
            const format = (val) => {
                if (val === null || isNaN(val)) return 'N/A';
                return val.toFixed(5);
            };
            
            // Kyber vs MEXC Contract
            if (kyberData && contractData) {
                const kyberBuyDiff = contractData.bid - kyberData.buyPrice;
                const kyberSellDiff = kyberData.sellPrice - contractData.ask;
                
                elements.kyberBuy.innerHTML = 
                    `K: $${format(kyberData.buyPrice)} | M: $${format(contractData.bid)} ` +
                    `<span class="difference">$${format(kyberBuyDiff)}</span>`;
                    
                elements.kyberSell.innerHTML = 
                    `K: $${format(kyberData.sellPrice)} | M: $${format(contractData.ask)} ` +
                    `<span class="difference">$${format(kyberSellDiff)}</span>`;
                
                applyAlertStyles(
                    elements.kyberBuy.querySelector('.difference'), 
                    kyberBuyDiff,
                    'kyber_buy'
                );
                applyAlertStyles(
                    elements.kyberSell.querySelector('.difference'), 
                    kyberSellDiff,
                    'kyber_sell'
                );
            }
            
            // Kyber vs Pyth
            if (kyberData && pythPrice !== null) {
                const kyberPythBuyDiff = pythPrice - kyberData.buyPrice;
                const kyberPythSellDiff = kyberData.sellPrice - pythPrice;

                elements.kyberPythBuy.innerHTML = 
                    `K: $${format(kyberData.buyPrice)} | P: $${format(pythPrice)} ` +
                    `<span class="difference">$${format(kyberPythBuyDiff)}</span>`;
                
                elements.kyberPythSell.innerHTML = 
                    `K: $${format(kyberData.sellPrice)} | P: $${format(pythPrice)} ` +
                    `<span class="difference">$${format(kyberPythSellDiff)}</span>`;
                
                applyAlertStyles(
                    elements.kyberPythBuy.querySelector('.difference'), 
                    kyberPythBuyDiff,
                    'kyber_pyth_buy'
                );
                applyAlertStyles(
                    elements.kyberPythSell.querySelector('.difference'), 
                    kyberPythSellDiff,
                    'kyber_pyth_sell'
                );
            }
            
        } catch (error) {
            console.error('Update Error:', error);
            Object.values(elements).forEach(el => {
                if (el) el.textContent = 'Error';
            });
        }
    }

    // Update the applyAlertStyles function to handle the new Jup vs Pyth comparison
    function applyAlertStyles(element, value, type) {
        if (!element) return;
        
        element.className = 'difference';
        const existingIcon = element.querySelector('.direction-icon');
        if (existingIcon) existingIcon.remove();
        
        let shouldPlaySound = false;
        let volume = 0.2;
        let frequency = 784; // Default frequency (G5)
        
        // Add direction icon
        const direction = document.createElement('span');
        direction.className = 'direction-icon';
        direction.textContent = value > 0 ? ' ↑' : ' ↓';
        element.appendChild(direction);
        
        // Different thresholds and sounds for each comparison type
        switch(type) {
            // Kyber vs MEXC Contract - Buy
            case 'kyber_buy':
                if (value > 0.0015) {
                    element.classList.add('alert-high-positive');
                    shouldPlaySound = true;
                    frequency = 1046; // C6
                } else if (value > 0.0003) {
                    element.classList.add('alert-medium-positive');
                    shouldPlaySound = true;
                    volume = 0.1;
                    frequency = 523; // A5
                }
                break;
                
            // Kyber vs MEXC Contract - Sell
            case 'kyber_sell':
                if (value > 0.0015) {
                    element.classList.add('alert-high-positive');
                    shouldPlaySound = true;
                    frequency = 523; // C5
                } else if (value > 0.00099) {
                    element.classList.add('alert-medium-positive');
                    shouldPlaySound = true;
                    volume = 0.1;
                    frequency = 587; // D5
                }
                break;
                
            // Kyber vs Pyth - Buy
            case 'kyber_pyth_buy':
                if (value > 0.001) {
                    element.classList.add('alert-high-positive');
                    shouldPlaySound = true;
                    frequency = value > 0 ? 1046 : 392; // C6 or G4
                } else if (value > 0.0005) {
                    element.classList.add('alert-medium-positive');
                    shouldPlaySound = true;
                    volume = 0.1;
                    frequency = value > 0 ? 880 : 440; // A5 or A4
                }
                break;
                
            // Kyber vs Pyth - Sell
            case 'kyber_pyth_sell':
                if (value > 0.001) {
                    element.classList.add('alert-high-positive');
                    shouldPlaySound = true;
                    frequency = value > 0 ? 1046 : 392; // C6 or G4
                } else if (value > 0.000) {
                    element.classList.add('alert-medium-positive');
                    shouldPlaySound = true;
                    volume = 0.1;
                    frequency = value > 0 ? 880 : 440; // A5 or A4
                }
                break;
        }

        if (shouldPlaySound && window.GlobalAudio && window.GlobalAudio.enabled) {
            window.playSystemAlert(volume, frequency);
        }
    }

    // Initialize the module
    (function init() {
        updateAlerts();
        updateFundingRate(); // Initial funding rate fetch
        // Set refresh rate
        setInterval(updateAlerts, 2500);
        setInterval(updateFundingRate, 60000); // Update funding rate every minute
    })();
  
    return { updateAlerts, updateFundingRate };
})();
