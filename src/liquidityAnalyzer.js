const axios = require('axios');

class LiquidityAnalyzer {
  constructor(tokenTrader) {
    this.tokenTrader = tokenTrader;
    // معايير السيولة الجيدة
    this.minLiquidity = 10000; // $10,000 حد أدنى
    this.minLiquidityGood = 50000; // $50,000 سيولة جيدة
    this.minLiquidityExcellent = 100000; // $100,000 سيولة ممتازة
  }

  /**
   * فحص سيولة العملة وإرجاع تقييم
   */
  async analyzeLiquidity(tokenAddress) {
    try {
      const priceData = await this.tokenTrader.getTokenPrice(tokenAddress);
      
      if (!priceData || priceData.liquidity === 0) {
        return {
          status: '❌ سيولة منخفضة جداً',
          liquidity: 0,
          rating: 0,
          emoji: '🔴',
          recommendation: 'لا تشتري - خطير جداً!',
          riskLevel: 'عالي جداً',
          isSafe: false
        };
      }

      const liquidity = parseFloat(priceData.liquidity);
      let status, rating, emoji, recommendation, riskLevel, isSafe;

      if (liquidity >= this.minLiquidityExcellent) {
        status = '✅ سيولة ممتازة جداً';
        rating = 5;
        emoji = '🟢';
        recommendation = 'آمن تماماً - شراء موصى به';
        riskLevel = 'منخفض جداً';
        isSafe = true;
      } else if (liquidity >= this.minLiquidityGood) {
        status = '✅ سيولة جيدة جداً';
        rating = 4;
        emoji = '🟢';
        recommendation = 'آمن - يمكن الشراء';
        riskLevel = 'منخفض';
        isSafe = true;
      } else if (liquidity >= this.minLiquidity) {
        status = '⚠️ سيولة متوسطة';
        rating = 3;
        emoji = '🟡';
        recommendation = 'احذر - قد يكون هناك انزلاق سعري';
        riskLevel = 'متوسط';
        isSafe = true;
      } else if (liquidity > 1000) {
        status = '⚠️ سيولة منخفضة';
        rating = 2;
        emoji = '🟠';
        recommendation = 'خطر - تجنب الشراء';
        riskLevel = 'عالي';
        isSafe = false;
      } else {
        status = '❌ سيولة منخفضة جداً';
        rating = 1;
        emoji = '🔴';
        recommendation = 'خطر جداً - لا تشتري!';
        riskLevel = 'عالي جداً';
        isSafe = false;
      }

      return {
        status,
        liquidity: liquidity.toFixed(2),
        rating,
        emoji,
        recommendation,
        riskLevel,
        isSafe,
        priceImpact: await this.estimatePriceImpact(tokenAddress, liquidity)
      };
    } catch (error) {
      console.error('خطأ في تحليل السيولة:', error);
      return {
        status: '❓ لم يتمكن من فحص السيولة',
        liquidity: 'N/A',
        rating: 0,
        emoji: '❓',
        recommendation: 'تحقق يدوياً',
        riskLevel: 'غير معروف',
        isSafe: false
      };
    }
  }

  /**
   * تقدير التأثير السعري بناءً على السيولة والمبلغ
   */
  async estimatePriceImpact(tokenAddress, liquidity) {
    try {
      // التأثير السعري يعتمد على النسبة بين المبلغ والسيولة
      return {
        small: ((0.1 / liquidity) * 100).toFixed(3), // 0.1 SOL
        medium: ((0.5 / liquidity) * 100).toFixed(3), // 0.5 SOL
        large: ((1.0 / liquidity) * 100).toFixed(3)   // 1.0 SOL
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * الحصول على تقرير سيولة مفصل
   */
  async getDetailedLiquidityReport(tokenAddress) {
    try {
      const analysis = await this.analyzeLiquidity(tokenAddress);
      const priceData = await this.tokenTrader.getTokenPrice(tokenAddress);

      const report = `
${analysis.emoji} **تقرير السيولة:**

السيولة: \`$${analysis.liquidity}\`
التقييم: ${'⭐'.repeat(analysis.rating)}
الحالة: ${analysis.status}
مستوى المخاطرة: ${analysis.riskLevel}

${analysis.recommendation}

📊 **التأثير السعري:**
• شراء 0.1 SOL: ~${analysis.priceImpact?.small || 'N/A'}%
• شراء 0.5 SOL: ~${analysis.priceImpact?.medium || 'N/A'}%
• شراء 1.0 SOL: ~${analysis.priceImpact?.large || 'N/A'}%

${analysis.isSafe ? '✅ آمن للشراء' : '❌ غير آمن - تجنب'}
      `;

      return report;
    } catch (error) {
      return `❌ خطأ: ${error.message}`;
    }
  }

  /**
   * فحص سريع قبل الشراء
   */
  async quickSafetyCheck(tokenAddress) {
    try {
      const analysis = await this.analyzeLiquidity(tokenAddress);
      
      return {
        isSafe: analysis.isSafe,
        emoji: analysis.emoji,
        status: analysis.status,
        warning: !analysis.isSafe ? analysis.recommendation : null
      };
    } catch (error) {
      return {
        isSafe: false,
        emoji: '❌',
        status: 'خطأ في الفحص',
        warning: 'لم يتمكن من التحقق من السيولة'
      };
    }
  }

  /**
   * الحصول على قائمة عملات بسيولة جيدة من DEX
   */
  async findTokensWithGoodLiquidity(limit = 10) {
    try {
      // يمكن استخدام APIs مختلفة مثل:
      // - Magic Eden API
      // - Jupiter API
      // - Birdeye API
      
      const response = await axios.get('https://api.jup.ag/v4/tokens', {
        params: {
          sort: 'liquidity',
          order: 'desc',
          limit
        }
      });

      const tokensWithGoodLiquidity = [];

      for (const token of response.data) {
        const analysis = await this.analyzeLiquidity(token.address);
        if (analysis.isSafe) {
          tokensWithGoodLiquidity.push({
            name: token.name,
            symbol: token.symbol,
            address: token.address,
            liquidity: analysis.liquidity,
            rating: analysis.rating,
            emoji: analysis.emoji
          });
        }
      }

      return tokensWithGoodLiquidity;
    } catch (error) {
      console.error('خطأ في البحث عن عملات:', error);
      return [];
    }
  }
}

module.exports = LiquidityAnalyzer;
