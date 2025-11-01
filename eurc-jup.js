const EURC_JUP = (() => {
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

    // Fetch Jupiter prices for EURC - UPDATED with new API endpoint
    async function fetchJupPriceForEURC() {
        const inputMintUSDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const outputMintEURC = 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr';
        
        try {
            const [buyResponse, sellResponse] = await Promise.all([
                // Updated to use /swap/v1/quote endpoint as per Jupiter docs
                fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMintUSDC}&outputMint=${outputMintEURC}&amount=11500000000`), // 11500 USDC
                fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${outputMintEURC}&outputMint=${inputMintUSDC}&amount=10000000000`)  // 10000 EURC
            ]);
            
            const buyData = await buyResponse.json();
            const sellData = await sellResponse.json();
            
            console.log('Jupiter Buy Response:', buyData);
            console.log('Jupiter Sell Response:', sellData);
            
            // Parse the new response format
            return {
                buyPrice: buyData?.outAmount ? 11500 / (parseInt(buyData.outAmount) / 1e6) : null,
                sellPrice: sellData?.outAmount ? (parseInt(sellData.outAmount) / 1e6) / 10000 : null
            };
        } catch (error) {
            console.error('Jupiter EURC Error:', error);
            return { buyPrice: null, sellPrice: null };
        }
    }

    // Update alerts with Jupiter and Pyth comparisons
    async function updateAlerts() {
        const elements = {
            // New elements for Jup vs Pyth
            jupPythBuy: document.getElementById('eurc-jup-pyth-buy-alert'),
            jupPythSell: document.getElementById('eurc-jup-pyth-sell-alert'),
            // Elements for Kyber vs Jupiter
            kyberJupBuy: document.getElementById('eurc-kyber-jup-buy-alert'),
            kyberJupSell: document.getElementById('eurc-kyber-jup-sell-alert')
        };

        try {
            const [kyberData, jupData, pythPrice] = await Promise.all([
                fetchKyberPrice(),
                fetchJupPriceForEURC(),
                fetchPythEURUSD()
            ]);
            
            // Formatting helper
            const format = (val) => {
                if (val === null || isNaN(val)) return 'N/A';
                return val.toFixed(5);
            };
            
            // Jupiter vs Pyth
            if (jupData && pythPrice !== null) {
                const jupPythBuyDiff = pythPrice - jupData.buyPrice;
                const jupPythSellDiff = jupData.sellPrice - pythPrice;

                elements.jupPythBuy.innerHTML = 
                    `J: $${format(jupData.buyPrice)} | P: $${format(pythPrice)} ` +
                    `<span class="difference">$${format(jupPythBuyDiff)}</span>`;
                
                elements.jupPythSell.innerHTML = 
                    `J: $${format(jupData.sellPrice)} | P: $${format(pythPrice)} ` +
                    `<span class="difference">$${format(jupPythSellDiff)}</span>`;
                
                applyAlertStyles(
                    elements.jupPythBuy.querySelector('.difference'), 
                    jupPythBuyDiff,
                    'jup_pyth_buy'
                );
                applyAlertStyles(
                    elements.jupPythSell.querySelector('.difference'), 
                    jupPythSellDiff,
                    'jup_pyth_sell'
                );
            }
            
            // Kyber vs Jupiter
            if (kyberData && jupData) {
                // Buy alert: Kyber buy vs Jupiter sell
                const kyberJupBuyDiff = jupData.sellPrice - kyberData.buyPrice;
                
                // Sell alert: Jupiter buy vs Kyber sell
                const kyberJupSellDiff = kyberData.sellPrice - jupData.buyPrice;

                elements.kyberJupBuy.innerHTML = 
                    `K Buy: $${format(kyberData.buyPrice)} | J Sell: $${format(jupData.sellPrice)} ` +
                    `<span class="difference">$${format(kyberJupBuyDiff)}</span>`;
                
                elements.kyberJupSell.innerHTML = 
                    `J Buy: $${format(jupData.buyPrice)} | K Sell: $${format(kyberData.sellPrice)} ` +
                    `<span class="difference">$${format(kyberJupSellDiff)}</span>`;
                
                applyAlertStyles(
                    elements.kyberJupBuy.querySelector('.difference'), 
                    kyberJupBuyDiff,
                    'kyber_jup_buy'
                );
                applyAlertStyles(
                    elements.kyberJupSell.querySelector('.difference'), 
                    kyberJupSellDiff,
                    'kyber_jup_sell'
                );
            }
            
        } catch (error) {
            console.error('Update Error:', error);
            Object.values(elements).forEach(el => {
                if (el) el.textContent = 'Error';
            });
        }
    }

    // Update the applyAlertStyles function
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
            // Jupiter vs Pyth - Buy
            case 'jup_pyth_buy':
                if (value > 0.001) {
                    element.classList.add('alert-high-positive');
                    shouldPlaySound = true;
                    frequency = 1046; // C6
                } else if (value > 0.0005) {
                    element.classList.add('alert-medium-positive');
                    shouldPlaySound = true;
                    volume = 0.1;
                    frequency = 880; // A5
                }
                break;
                
            // Jupiter vs Pyth - Sell
            case 'jup_pyth_sell':
                if (value > 0.001) {
                    element.classList.add('alert-high-positive');
                    shouldPlaySound = true;
                    frequency = 1046; // C6
                } else if (value > 0.000) {
                    element.classList.add('alert-medium-positive');
                    shouldPlaySound = true;
                    volume = 0.1;
                    frequency = 880; // A5
                }
                break;
                
            // Kyber vs Jupiter - Buy
            case 'kyber_jup_buy':
                // Positive value means Kyber buy price is higher than Jupiter sell price
                if (value > 0.001) {
                    element.classList.add('alert-high-positive');
                    shouldPlaySound = true;
                    frequency = 1046; // C6
                } else if (value > 0.0002) {
                    element.classList.add('alert-medium-positive');
                    shouldPlaySound = true;
                    volume = 0.1;
                    frequency = 880; // A5
                }
                break;
                
            // Kyber vs Jupiter - Sell
            case 'kyber_jup_sell':
                // Positive value means Jupiter buy price is higher than Kyber sell price
                if (value > 0.001) {
                    element.classList.add('alert-high-positive');
                    shouldPlaySound = true;
                    frequency = 1046; // C6
                } else if (value > 0.0002) {
                    element.classList.add('alert-medium-positive');
                    shouldPlaySound = true;
                    volume = 0.1;
                    frequency = 880; // A5
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
        // Set refresh rate
        setInterval(updateAlerts, 4000);
    })();
  
    return { updateAlerts };
})();
