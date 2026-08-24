require('dotenv').config();
const { Telegraf } = require('telegraf');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const SolanaClient = require('./src/solanaClient');
const TokenTrader = require('./src/tokenTrader');
const AutoTrader = require('./src/autoTrader');
const LiquidityAnalyzer = require('./src/liquidityAnalyzer');
const PortfolioManager = require('./src/portfolioManager');
const Database = require('./src/database');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

// عنوان المحفظة
const WALLET_ADDRESS = 'Cb2Wzfx81bhSSGAWWEKnwjLBFbvm6ozUQCQgnJ3J2dq5';

// إنشاء كائن من قاعدة البيانات
const db = new Database();

// إنشاء العميل والتاجر
let solanaClient;
let tokenTrader;
let autoTrader;
let liquidityAnalyzer;
let portfolioManager;

try {
  const privateKeyBuffer = bs58.decode(process.env.WALLET_PRIVATE_KEY);
  const keypair = Keypair.fromSecretKey(privateKeyBuffer);
  solanaClient = new SolanaClient(connection, keypair);
  tokenTrader = new TokenTrader(solanaClient, connection);
  autoTrader = new AutoTrader(tokenTrader, db);
  liquidityAnalyzer = new LiquidityAnalyzer(tokenTrader);
  portfolioManager = new PortfolioManager(solanaClient, db, connection);
  console.log('✅ تم تهيئة البوت بنجاح');
  console.log(`📍 المحفظة: ${WALLET_ADDRESS}`);
} catch (error) {
  console.error('❌ خطأ في تهيئة البوت:', error.message);
  process.exit(1);
}

// إنشاء قاعدة البيانات
db.initialize();

// ==================== الأوامر الأساسية ====================

bot.start((ctx) => {
  const welcomeMessage = `
🤖 أهلاً وسهلاً في بوت الاستثمار الذكي على سولانا!

📍 **محفظتك:**
\`${WALLET_ADDRESS}\`

📊 **الميزات الرئيسية:**
• 🔍 تحليل العملات الاستثمارية
• 💰 إدارة محفظة ذكية
• 🚀 شراء سريع بـ 0.05 SOL
• 🎯 بيع تلقائي عند 200% مكسب
• 🟢 فحص السيولة الجيدة ($1M+)
• 📈 تتبع الأرباح طويلة الأجل
• 📊 تقارير تفصيلية يومية

💡 **الأوامر:**
/start - الصفحة الرئيسية
/balance - عرض الرصيد والمحفظة
/analyze - تحليل عملة جديدة
/buy - شراء عملة استثمارية
/portfolio - إدارة المحفظة
/performance - أداء المحفظة
/help - المساعدة

⚠️ **ملاحظة:** استثمر بمسؤولية!
  `;
  ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 الرصيد', callback_data: 'balance' },
          { text: '📊 المحفظة', callback_data: 'portfolio' }
        ],
        [
          { text: '🔍 تحليل عملة', callback_data: 'analyze' },
          { text: '🚀 شراء', callback_data: 'quick_buy' }
        ],
        [
          { text: '📈 الأداء', callback_data: 'performance' },
          { text: '❓ المساعدة', callback_data: 'help' }
        ]
      ]
    }
  });
});

// عرض الرصيد والمحفظة
bot.command('balance', async (ctx) => {
  try {
    ctx.sendChatAction('typing');
    const balance = await solanaClient.getSolBalance();
    const portfolio = await db.getUserPortfolio(ctx.from.id);
    
    let message = `
💰 **رصيد المحفظة:**

🌊 SOL: \`${balance.toFixed(4)}\` ◎

📊 **العملات المحتفظ بها:** ${portfolio.length}
`;
    
    if (portfolio.length > 0) {
      message += '\n**التفاصيل:**\n';
      portfolio.forEach((token, index) => {
        message += `${index + 1}. ${token.symbol} - ${token.amount} قطعة\n`;
      });
    }
    
    ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚀 شراء', callback_data: 'quick_buy' },
            { text: '📊 التفاصيل', callback_data: 'portfolio_details' }
          ]
        ]
      }
    });
  } catch (error) {
    ctx.reply(`❌ خطأ: ${error.message}`);
  }
});

// تحليل العملة
bot.command('analyze', async (ctx) => {
  ctx.reply('🔍 **تحليل عملة استثمارية**\n\n📝 أرسل عنوان العملة (Token Address):');
  ctx.session = ctx.session || {};
  ctx.session.waitingFor = 'analyze_address';
});

// الشراء
bot.command('buy', async (ctx) => {
  ctx.reply('🚀 **شراء عملة استثمارية**\n\n📝 أرسل عنوان العملة:');
  ctx.session = ctx.session || {};
  ctx.session.waitingFor = 'buy_address';
});

// أداء المحفظة
bot.command('performance', async (ctx) => {
  try {
    ctx.sendChatAction('typing');
    const performance = await portfolioManager.getPortfolioPerformance(ctx.from.id);
    ctx.reply(performance, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.reply(`❌ خطأ: ${error.message}`);
  }
});

// ==================== معالجات Callback ====================

bot.action('balance', async (ctx) => {
  try {
    ctx.answerCbQuery();
    const balance = await solanaClient.getSolBalance();
    ctx.editMessageText(
      `💰 رصيدك: \`${balance.toFixed(4)}\` ◎\n\n📍 محفظتك: \`${WALLET_ADDRESS}\``,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    ctx.answerCbQuery('❌ خطأ في جلب الرصيد');
  }
});

bot.action('portfolio', async (ctx) => {
  try {
    ctx.answerCbQuery();
    ctx.sendChatAction('typing');
    
    const balance = await solanaClient.getSolBalance();
    const portfolio = await db.getUserPortfolio(ctx.from.id);
    
    let message = `
📊 **محفظتك الاستثمارية:**

💰 الرصيد: \`${balance.toFixed(4)}\` ◎
📈 العملات: ${portfolio.length}

📍 العنوان:
\`${WALLET_ADDRESS}\`
`;
    
    if (portfolio.length === 0) {
      message += '\n📭 لا توجد عملات في محفظتك حالياً';
    } else {
      message += '\n**العملات:**\n';
      portfolio.forEach((token, index) => {
        message += `${index + 1}. ${token.symbol}\n   الكمية: ${token.amount}\n`;
      });
    }
    
    ctx.editMessageText(message, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.answerCbQuery(`❌ خطأ: ${error.message}`);
  }
});

bot.action('analyze', (ctx) => {
  ctx.answerCbQuery();
  ctx.editMessageText(
    '🔍 **تحليل عملة استثمارية**\n\n📝 أرسل عنوان العملة:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '← رجوع', callback_data: 'back_menu' }]
        ]
      }
    }
  );
  ctx.session = ctx.session || {};
  ctx.session.waitingFor = 'analyze_address';
});

bot.action('quick_buy', (ctx) => {
  ctx.answerCbQuery();
  ctx.editMessageText(
    '🚀 **شراء عملة استثمارية**\n\n✅ سيتم فحص السيولة تلقائياً\n\n📝 أرسل عنوان العملة:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '← رجوع', callback_data: 'back_menu' }]
        ]
      }
    }
  );
  ctx.session = ctx.session || {};
  ctx.session.waitingFor = 'buy_address';
});

bot.action('performance', async (ctx) => {
  try {
    ctx.answerCbQuery();
    ctx.sendChatAction('typing');
    const performance = await portfolioManager.getPortfolioPerformance(ctx.from.id);
    ctx.editMessageText(performance, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.answerCbQuery(`❌ خطأ: ${error.message}`);
  }
});

bot.action('back_menu', (ctx) => {
  ctx.answerCbQuery();
  ctx.editMessageText('📋 القائمة الرئيسية', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💰 الرصيد', callback_data: 'balance' },
          { text: '📊 المحفظة', callback_data: 'portfolio' }
        ],
        [
          { text: '🔍 تحليل', callback_data: 'analyze' },
          { text: '🚀 شراء', callback_data: 'quick_buy' }
        ],
        [
          { text: '📈 الأداء', callback_data: 'performance' }
        ]
      ]
    }
  });
  ctx.session = ctx.session || {};
  ctx.session.waitingFor = null;
});

// ==================== معالجة الرسائل النصية ====================

bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text;
    ctx.session = ctx.session || {};
    
    if (ctx.session.waitingFor === 'analyze_address') {
      await handleAnalyzeAddress(ctx, text);
    } else if (ctx.session.waitingFor === 'buy_address') {
      await handleBuyAddress(ctx, text);
    } else if (ctx.session.waitingFor === 'buy_amount') {
      await handleBuyAmount(ctx, text);
    } else {
      ctx.reply('ℹ️ استخدم /help للحصول على قائمة الأوامر');
    }
  } catch (error) {
    ctx.reply(`❌ حدث خطأ: ${error.message}`);
  }
});

// ==================== دوال المعالجة ====================

async function handleAnalyzeAddress(ctx, tokenAddress) {
  try {
    if (!isValidSolanaAddress(tokenAddress)) {
      ctx.reply('❌ عنوان غير صحيح');
      return;
    }

    ctx.sendChatAction('typing');
    
    // الحصول على تقرير مفصل
    const report = await liquidityAnalyzer.getDetailedLiquidityReport(tokenAddress);
    const priceData = await tokenTrader.getTokenPrice(tokenAddress);
    
    const fullReport = `
${report}

💹 **معلومات إضافية:**
السعر الحالي: \`${priceData.price} SOL\`
التغير 24h: ${priceData.change24h}%

🎯 **توصية:** هذه عملة جيدة للاستثمار طويل الأجل إذا:
✅ كانت السيولة كافية ($1M+)
✅ كان حجم التداول عالي ($10M+)
✅ كان المشروع له استخدام حقيقي
    `;
    
    ctx.reply(fullReport, { parse_mode: 'Markdown' });
    ctx.session.waitingFor = null;
  } catch (error) {
    ctx.reply(`❌ خطأ: ${error.message}`);
  }
}

async function handleBuyAddress(ctx, tokenAddress) {
  try {
    if (!isValidSolanaAddress(tokenAddress)) {
      ctx.reply('❌ عنوان غير صحيح');
      return;
    }

    ctx.sendChatAction('typing');
    
    // فحص السيولة أولاً
    const liquidityCheck = await liquidityAnalyzer.quickSafetyCheck(tokenAddress);
    
    if (!liquidityCheck.isSafe) {
      ctx.reply(`
${liquidityCheck.emoji} **فحص السيولة:**

${liquidityCheck.status}

⚠️ ${liquidityCheck.warning}

❌ **غير آمن للشراء**
      `, { parse_mode: 'Markdown' });
      ctx.session.waitingFor = null;
      return;
    }

    // إذا كانت آمنة
    ctx.session.tokenAddress = tokenAddress;
    ctx.session.waitingFor = 'buy_amount';
    
    ctx.reply(`
${liquidityCheck.emoji} ${liquidityCheck.status}

✅ العملة آمنة للشراء!

💵 أدخل المبلغ بـ SOL (الحد الأدنى: 0.05):
    `, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.reply(`❌ خطأ: ${error.message}`);
  }
}

async function handleBuyAmount(ctx, amount) {
  try {
    const solAmount = parseFloat(amount);
    if (isNaN(solAmount) || solAmount < 0.05) {
      ctx.reply('❌ الحد الأدنى: 0.05 SOL');
      return;
    }
    
    ctx.sendChatAction('typing');
    ctx.reply('⏳ جاري معالجة الشراء...');
    
    const tokenAddress = ctx.session.tokenAddress;
    const result = await autoTrader.startAutoTrade(ctx.from.id, tokenAddress, solAmount, 200);
    
    if (result.success) {
      ctx.reply(`
✅ **تم الشراء بنجاح!**

🎯 التفاصيل:
• العملة: \`${tokenAddress.slice(0, 8)}...\`
• المبلغ: ${solAmount} SOL
• الهدف (200%): ${result.targetPrice}

🤖 جاري المراقبة التلقائية...
⏱️ سيتم البيع عند الوصول للهدف

🔗 Solscan: https://solscan.io/tx/${result.signature}
      `, { parse_mode: 'Markdown' });
    } else {
      ctx.reply(`❌ فشل الشراء: ${result.error}`);
    }
    
    ctx.session.waitingFor = null;
  } catch (error) {
    ctx.reply(`❌ خطأ: ${error.message}`);
  }
}

// ==================== دوال مساعدة ====================

function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// ==================== بدء البوت ====================

bot.launch();
console.log('🚀 بدء تشغيل البوت...');
console.log(`📍 المحفظة المتصلة: ${WALLET_ADDRESS}`);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
