/* ============================================
   NewsHub 资讯聚合 - 数据预渲染脚本
   从多个公开API拉取资讯，统一格式后输出到 data/news.json
   用法：node scripts/fetch-news.js
   ============================================ */

'use strict';

const fs = require('fs');
const path = require('path');

// 兼容老版本 Node：尝试动态 import node-fetch
let fetch;
try {
    fetch = require('node-fetch');
} catch (e) {
    fetch = global.fetch; // Node 18+ 内置 fetch
}

// ---------- 配置 ----------
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'news.json');
const CATEGORIES = ['business', 'technology', 'entertainment', 'sports', 'health', 'science'];
const MAX_ARTICLES_PER_CATEGORY = 30;
const MAX_TOTAL_ARTICLES = 200;
const REQUEST_TIMEOUT = 15000;

// 从环境变量读取 API keys
const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const GNEWS_API_KEY = process.env.GNEWS_API_KEY || '';
const MEDIASTACK_API_KEY = process.env.MEDIASTACK_API_KEY || '';

// ---------- 工具函数 ----------
function log(msg, type = 'info') {
    const prefix = { info: '[INFO]', warn: '[WARN]', error: '[ERROR]', success: '[✓]' }[type] || '[INFO]';
    const time = new Date().toLocaleString('zh-CN');
    console.log(`${prefix} ${time} ${msg}`);
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
        const resp = await fetch(url, { ...options, signal: controller.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

// 统一格式文章对象
function normalizeArticle(raw, category, sourceName) {
    const title = (raw.title || '').trim();
    if (!title) return null;

    // 过滤标题党/占位文章
    if (title.length < 5 || /\[Removed\]|\[Removed by|\[redacted\]/i.test(title)) return null;

    const description = (raw.description || raw.content || raw.summary || '').trim();
    const image = raw.urlToImage || raw.image || raw.url_image || raw.thumbnail || '';
    const url = raw.url || raw.link || '';
    const source = sourceName || (typeof raw.source === 'object' ? raw.source.name : raw.source) || 'Unknown';
    const publishedAt = raw.publishedAt || raw.published_at || raw.date || new Date().toISOString();

    return {
        title,
        description: description.slice(0, 300),
        category: category || raw.category || 'general',
        source,
        url,
        image: validateImageUrl(image) ? image : '',
        publishedAt: new Date(publishedAt).toISOString()
    };
}

function validateImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url) ||
           /^https?:\/\/[^.]+\.(unsplash|pexels|pixabay|picsum)\.com/i.test(url);
}

// 去重：基于标题相似度
function deduplicate(articles) {
    const seen = new Set();
    const result = [];
    for (const a of articles) {
        const key = a.title.toLowerCase()
            .replace(/[\s\p{P}]/gu, '')
            .slice(0, 50);
        if (!seen.has(key)) {
            seen.add(key);
            result.push(a);
        }
    }
    return result;
}

// ---------- API 1: NewsAPI.org ----------
async function fetchFromNewsAPI(category) {
    if (!NEWS_API_KEY) {
        log(`NewsAPI.org: 未配置 API key，跳过`, 'warn');
        return [];
    }
    try {
        const url = `https://newsapi.org/v2/top-headlines?category=${category}&language=en&pageSize=${MAX_ARTICLES_PER_CATEGORY}&apiKey=${NEWS_API_KEY}`;
        const data = await fetchWithTimeout(url);
        if (data.status !== 'ok') throw new Error(data.message || '未知错误');
        const articles = (data.articles || [])
            .map(a => normalizeArticle(a, category, 'NewsAPI'))
            .filter(Boolean);
        log(`NewsAPI.org [${category}]: 获取 ${articles.length} 篇`, 'success');
        return articles;
    } catch (e) {
        log(`NewsAPI.org [${category}]: 失败 - ${e.message}`, 'error');
        return [];
    }
}

async function fetchNewsAPIAll() {
    if (!NEWS_API_KEY) return [];
    const results = [];
    for (const cat of CATEGORIES) {
        const list = await fetchFromNewsAPI(cat);
        results.push(...list);
    }
    // 也抓取 general 类作为补充
    try {
        const url = `https://newsapi.org/v2/top-headlines?category=general&language=en&pageSize=20&apiKey=${NEWS_API_KEY}`;
        const data = await fetchWithTimeout(url);
        if (data.status === 'ok') {
            results.push(...(data.articles || [])
                .map(a => normalizeArticle(a, 'general', 'NewsAPI'))
                .filter(Boolean));
        }
    } catch (e) { /* ignore */ }
    return results;
}

// ---------- API 2: GNews.io ----------
async function fetchFromGNews(category) {
    if (!GNEWS_API_KEY) {
        log(`GNews.io: 未配置 API key，跳过`, 'warn');
        return [];
    }
    try {
        const topicMap = {
            business: 'business',
            technology: 'technology',
            entertainment: 'entertainment',
            sports: 'sports',
            health: 'health',
            science: 'science'
        };
        const topic = topicMap[category] || 'world';
        const url = `https://gnews.io/api/v4/top-headlines?category=${topic}&lang=en&max=${MAX_ARTICLES_PER_CATEGORY}&apikey=${GNEWS_API_KEY}`;
        const data = await fetchWithTimeout(url);
        const articles = (data.articles || [])
            .map(a => normalizeArticle(a, category, 'GNews'))
            .filter(Boolean);
        log(`GNews.io [${category}]: 获取 ${articles.length} 篇`, 'success');
        return articles;
    } catch (e) {
        log(`GNews.io [${category}]: 失败 - ${e.message}`, 'error');
        return [];
    }
}

async function fetchGNewsAll() {
    if (!GNEWS_API_KEY) return [];
    const results = [];
    for (const cat of CATEGORIES) {
        const list = await fetchFromGNews(cat);
        results.push(...list);
    }
    return results;
}

// ---------- API 3: MediaStack ----------
async function fetchFromMediaStack(category) {
    if (!MEDIASTACK_API_KEY) {
        log(`MediaStack: 未配置 API key，跳过`, 'warn');
        return [];
    }
    try {
        const url = `http://api.mediastack.com/v1/news?access_key=${MEDIASTACK_API_KEY}&categories=${category}&languages=en&limit=${MAX_ARTICLES_PER_CATEGORY}`;
        const data = await fetchWithTimeout(url);
        const articles = (data.data || [])
            .map(a => normalizeArticle(a, category, 'MediaStack'))
            .filter(Boolean);
        log(`MediaStack [${category}]: 获取 ${articles.length} 篇`, 'success');
        return articles;
    } catch (e) {
        log(`MediaStack [${category}]: 失败 - ${e.message}`, 'error');
        return [];
    }
}

async function fetchMediaStackAll() {
    if (!MEDIASTACK_API_KEY) return [];
    const results = [];
    for (const cat of CATEGORIES) {
        const list = await fetchFromMediaStack(cat);
        results.push(...list);
    }
    return results;
}

// ---------- API 4: 公开的 RSS 到 JSON 免费服务 (RSS2JSON) ----------
// 使用 rss2json.com 免费转换几个主流新闻源 RSS
const RSS_SOURCES = [
    { name: 'BBC Technology', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', category: 'technology' },
    { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', category: 'business' },
    { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml?edition=int', category: 'sports' },
    { name: 'BBC Science', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', category: 'science' },
    { name: 'BBC Health', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', category: 'health' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', category: 'technology' },
    { name: 'Reuters Business', url: 'https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best', category: 'business' },
    { name: 'CNN Entertainment', url: 'http://rss.cnn.com/rss/edition_entertainment.rss', category: 'entertainment' },
    { name: 'ESPN', url: 'https://www.espn.com/espn/rss/news', category: 'sports' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss', category: 'technology' }
];

async function fetchFromRSS() {
    const results = [];
    log(`RSS2JSON: 开始抓取 ${RSS_SOURCES.length} 个 RSS 源`, 'info');

    // 串行抓取，避免免费 API 限流
    for (const src of RSS_SOURCES) {
        try {
            const rssUrl = encodeURIComponent(src.url);
            const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${rssUrl}`;
            const data = await fetchWithTimeout(apiUrl);
            if (data.status !== 'ok' || !Array.isArray(data.items)) continue;

            const articles = data.items
                .slice(0, 15)
                .map(item => {
                    const thumbnail = item.thumbnail ||
                        (item.enclosure && item.enclosure.link) ||
                        extractFirstImage(item.description) || '';
                    return normalizeArticle({
                        title: item.title,
                        description: stripHtml(item.description),
                        url: item.link,
                        urlToImage: thumbnail,
                        publishedAt: item.pubDate
                    }, src.category, src.name);
                })
                .filter(Boolean);

            results.push(...articles);
            log(`  RSS [${src.name}]: ${articles.length} 篇`, 'success');
        } catch (e) {
            log(`  RSS [${src.name}]: 失败 - ${e.message}`, 'error');
        }
    }
    return results;
}

function stripHtml(html) {
    if (!html) return '';
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractFirstImage(html) {
    if (!html) return '';
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match ? match[1] : '';
}

// ---------- 生成示例数据（兜底方案）----------
function generateFallbackData() {
    log('未配置任何 API key，使用内置示例数据', 'warn');

    const categories = ['technology', 'business', 'entertainment', 'sports', 'health', 'science'];
    const sources = ['BBC News', 'Reuters', 'CNN', 'TechCrunch', 'Wired', 'ESPN', 'Forbes', 'Bloomberg', 'The Verge', 'AP News', 'NPR', 'The Guardian', 'CNBC', 'MarketWatch', 'Nature', 'Science Daily'];
    const titlesByCat = {
        technology: [
            'AI Model Achieves Breakthrough Performance in Scientific Research','Next Generation Smartphone Features Revolutionary Battery Technology','Quantum Computing Reaches New Milestone with 1000 Qubits','Open Source Community Celebrates 25th Anniversary of Linux','Autonomous Vehicles Begin Public Road Testing in Major Cities','Tech Giants Announce Joint Effort on Sustainable Data Centers','New Programming Language Gains Traction Among Developers','Wearable Tech Market Surges with Health Monitoring Features',
            'Domestic Operating System Ecosystem Surpasses 5 Million Apps','First Commercial 5G-Advanced Network Launches with 10Gbps Downlink','Foldable Smartphone Market Share Hits 15 Percent, Prices Drop','Memory Chip Prices Bottom Out as Industry Enters Uptrend','High-Performance RISC-V Processor Tapes Out Matching ARM Performance','AI Coding Assistants Now Used by 80 Percent of Developers','Medical-Grade Wearables Add Continuous Glucose Monitoring','Satellite Internet Surpasses 5 Million Subscribers Worldwide',
            'Next-Gen AR Glasses Slash Weight Below 30 Grams with New Optics','National Unified Computing Network Accelerates Data Sharing','Photonic Chip Manufacturing Yield Improves to 60 Percent','Edge Compute Deployment Tops 1 Million Nodes for IIoT','Neuromorphic Architecture Delivers 100x GPU Energy Efficiency','Soft Robot Actuator Cost Drops 90 Percent for Home Use','Next GPU Architecture Delivers 4x AI Training Performance','Low-Code Platforms Capture 30 Percent Market Share'
        ],
        business: [
            'Global Markets Rally as Economic Indicators Show Positive Growth','Renewable Energy Sector Attracts Record Investment This Quarter','Central Banks Signal Potential Policy Shift in Coming Months','Supply Chain Resilience Becomes Top Priority for Corporations','E-Commerce Platforms Report Record Sales During Holiday Season','Real Estate Market Shows Signs of Stabilization After Downturn','Startup Ecosystem Flourishes with New Venture Capital Inflows','Digital Currency Regulations Gain Clarity in Major Economies',
            'Consumer Spending Rebounds, Retail Sales Beat Expectations','Sci-Tech Innovation Board IPOs Normalize for Hard Tech Firms','Gold Breaks All-Time High Amid Safe-Haven Demand Flows','Mutual Fund Industry Tops 30 Trillion AUM, Equity Share Rises','Private Enterprise Confidence Index Rises, New Registrations Up 15%','Foreign Trade Diversification Pays Off, Emerging Market Exports Surge','National Carbon Market Expands to Eight Industry Sectors','Infrastructure REITs Grow Past 100 Billion in Assets',
            'Specialized SMEs Exceed 120,000 as Manufacturing Upgrades','Unified Domestic Market Construction Accelerates Barrier Removal','Consumption Vouchers Show Measurable Impact on Holiday Spending','Semiconductor Supply Chain Investment Tops 500 Billion','Green Finance Loans Surpass 30 Trillion, Carbon Goals Advance','SOE Reform Deepens, Strategic Emerging Industry Assets Rise','Services Trade Pilot Expands, Digital Service Exports Grow','County-Level Commerce System Upgrades Rural Consumption'
        ],
        entertainment: [
            'Award Season Kicks Off with Surprise Nominations Announced','Streaming Services Invest Billions in Original Content Production','Global Box Office Revenue Returns to Pre-Pandemic Levels','Music Festival Season Breaks Attendance Records Worldwide','Cultural Phenomenon: Viral Trends Shape Entertainment Industry','Virtual Reality Experiences Gain Mainstream Audience Adoption','Animated Films Dominate Box Office with Record-Breaking Run','Celebrity Philanthropy Reaches New Heights This Year',
            'Immersive Theater Becomes New Consumer Trend Nationwide','Stand-Up Comedy Goes Mainstream as Live Shows Double in Size','Variety Shows Innovate, Cultural Programs Win Ratings and Acclaim','Web Novel Export Revenue Exceeds 5 Billion, Global IP Influence Grows','Musical Theater Market Booms, Annual Box Office Tops 5 Billion','Museum Cultural Merchandise Hot Sales, Archaeo-Blind Box Series Break 100M','Short Drama Industry Explodes with 100K+ Annual Releases','Animation Industry Tops 300 Billion, Domestic Works on the Rise',
            'Live-Streaming Commerce Ecosystem Matures with KOL Incubation','Game License Approval Normalizes, Domestic Titles Shine Overseas','Digital Collectibles Industry Regulates, Compliant Platforms Explore Use Cases','Concert Market Sees Revenge Growth, Annual Box Office Tops 20B','Guochao Brand Collaborations Popularize Traditional Culture Among Youth','Podcast Listeners Top 200 Million, Audio Economy Enters Blue Ocean','Film Industrial System Established, VFX Production Costs Fall','Online Karaoke Users Top 500 Million, Music Social Scenarios Innovate'
        ],
        sports: [
            'Underdog Team Stuns Champions in Thrilling Overtime Victory','Olympic Committee Announces New Sports for Upcoming Games','Tennis Legend Announces Retirement After Historic Career','Basketball League Expands to New Markets Across Continents','Marathon World Record Shattered by Three Minutes','Esports Stadium Opens to Capacity Crowds in Major City','Youth Sports Programs Receive Major Funding Boost','Paralympic Athletes Break Multiple Records at Championship',
            'Womens Football Overseas Contingent Expands to All Top 5 Leagues','CBA Draft Quality Improves, College Players Become Major Force','Tennis China Season Upgrades, Masters 1000 Permanently Lands in Shanghai','Table Tennis World Youth Championships Sweep 7 Golds','Badminton World Championships Team Claims 3 Golds in Smooth Transition','Swimming Worlds Multiple Breakthroughs by Young Athletes','Gymnastics Worlds Top Medal Table, Difficulty and Quality Lead','Volleyball League New Foreign Player Rules Raise Competitiveness',
            '3x3 Basketball Professionalization Speeds, Team World Ranking Top 3','Breakdance Officially an Olympic Sport, Street Dance Industry Seizes Chance','Sporting Goods Export Hits All-Time High, Domestic Brands Capture 60%+','Smart Venue Construction Speeds Up, Spectator Experience Upgrades','Trail Running Regulation Strengthened, Safety Guarantee System Improved','National Sports Consumption Pilot Cities Expand, Night Economy Fuses','Campus Football Reform Deepens, Diversified Youth Academy Develops','Surfing Skateboarding Extreme Sports Popularize, Niche Goes Mass Market'
        ],
        health: [
            'Breakthrough Treatment Shows Promise for Rare Genetic Disorder','Global Vaccination Campaign Reaches Major Milestone','Mental Health Awareness Movement Gains Momentum Worldwide','New Study Reveals Benefits of Mediterranean Diet Extended','Telemedicine Usage Stabilizes at Higher Than Pre-Pandemic Levels','AI-Powered Diagnostic Tool Achieves 98% Accuracy Rate','Exercise Guidelines Updated to Include Weekly Strength Training','Public Health Initiative Reduces Childhood Obesity Rates',
            'Innovative Drug Price Negotiations Normalize, Patient Burden Drops Sharply','Cell Therapy Products Approved One After Another, Cancer Treatment Enters New Era','High-End Medical Device Domestic Import Substitution Accelerates','Internet Plus Chronic Disease Management Lands, Refills Convenient','CDC Capabilities Comprehensively Upgraded After Public Health Shortfall','TCM Evidence-Based Medicine Breakthrough, International Standards Set','Youth Myopia Control Achieves First-Ever Decline','Geriatrics Department Construction Speeds, Medical-Nursing Model Promoted',
            'Nutraceutical Industry Regulation Tightens, Function Claims Scrutinized','Rare Disease Drug Access Mechanism Improves, 50+ New Treatments Yearly','Medical Lab Result Mutual Recognition Pushed Nationally','Rehabilitation Medical System Builds Out, Beds Increase 50 Percent','Vaccine Traceability Fully Implemented, Safety Guaranteed Throughout','Medical Aesthetics Under Strict Supervision, Black Market Rapidly Replaced','Health Insurance Product Innovation, Previously Uninsurable Conditions Added','Grassroots Medical Staff Ranks Expand, Rural Doctor Benefits Improved'
        ],
        science: [
            'Space Agency Announces Manned Mission to Mars Timeline','Deep Ocean Expedition Discovers New Species in Pacific Trench','Climate Scientists Publish Optimistic Emissions Reduction Report','New Material Developed That Could Revolutionize Battery Storage','Archaeologists Unearth Ancient Civilization Ruins in Desert','Brain Research Identifies Neural Pathways Linked to Creativity','Renewable Energy Breakthrough: Artificial Photosynthesis Improved','Astronomers Detect Signals from Distant Exoplanet Atmosphere',
            'Pulsar Navigation Experimental Satellite Launched Successfully','First Solar Probe Images Released, Solar Wind Origins Clarified','Synthetic Biology Explodes: Artificial Starch Scales to Production','First Exascale Supercomputer Goes Operational, Leads World','Stem Cell Spinal Cord Injury Trial Makes Clinical Breakthrough','Novel Carbon Capture Material Cuts Cost by 80 Percent','Quantum Repeater Key Technology Breakthrough Extends Network','Second Tibetan Plateau Scientific Expedition Finds Many New Species',
            'Gravitational Wave Detector Sensitivity Tripled, Cosmic Evolution Clues','Full Brain Connectivity Atlas Completed, Neuroscience Cornerstone Laid','Next-Generation Large Survey Telescope Breaks Ground, Sky Surveys Leap','Nano-Robotic Targeted Drug Delivery Enters Preclinical Research','High-Temperature Superconductivity Mechanism Consensus Achieved','Artificial CO2-to-Sugar Technology Makes Critical Progress','Meteorite Contains Biologically Relevant Molecules, Origins of Life New Evidence','Global Climate Model Prediction Accuracy Improves, Extreme Weather Early Warning'
        ]
    };

    const images = [
        'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1585829365295-ab7cd400c167?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1532938911079-1b06ac7ceec7?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&h=450&fit=crop',
        'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=450&fit=crop',
        ''
    ];

    const articles = [];
    const now = Date.now();
    let id = 0;
    const PER_CATEGORY = 34;

    for (const cat of categories) {
        const titles = titlesByCat[cat];
        for (let i = 0; i < PER_CATEGORY; i++) {
            const base = titles[i % titles.length];
            const suffix = i >= titles.length ? ` [In-Depth ${i - titles.length + 1}]` : '';
            const ts = now - (id * 3600000);
            articles.push({
                title: base + suffix,
                description: `${base}${suffix}. This is a sample news article showcasing the website's interface before API configuration. After deployment with valid API keys, this content will be automatically replaced with real news data from trusted sources, refreshed on a daily schedule by GitHub Actions.`,
                category: cat,
                source: sources[id % sources.length],
                url: `https://example.com/article/${id}`,
                image: images[id % images.length],
                publishedAt: new Date(ts).toISOString()
            });
            id++;
        }
    }
    return articles;
}

// ---------- 主流程 ----------
async function main() {
    log('========== NewsHub 数据抓取开始 ==========', 'info');

    const hasAnyKey = NEWS_API_KEY || GNEWS_API_KEY || MEDIASTACK_API_KEY;
    let allArticles = [];

    if (hasAnyKey) {
        log(`检测到已配置 API key，开始抓取真实资讯...`, 'info');

        const results = await Promise.allSettled([
            fetchNewsAPIAll(),
            fetchGNewsAll(),
            fetchMediaStackAll(),
            fetchFromRSS()
        ]);

        results.forEach((r, idx) => {
            if (r.status === 'fulfilled' && Array.isArray(r.value)) {
                allArticles.push(...r.value);
            }
        });
    } else {
        log('未检测到 API key，尝试使用 RSS 公共源...', 'info');
        try {
            const rssArticles = await fetchFromRSS();
            allArticles.push(...rssArticles);
        } catch (e) {
            log(`RSS 抓取失败: ${e.message}`, 'error');
        }
    }

    // 如果没有任何数据，使用示例数据
    if (allArticles.length === 0) {
        allArticles = generateFallbackData();
    }

    // 数据处理
    log(`共获取原始数据 ${allArticles.length} 篇，开始处理...`, 'info');
    allArticles = deduplicate(allArticles);
    allArticles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    allArticles = allArticles.slice(0, MAX_TOTAL_ARTICLES);

    // 必须带 URL 才能点击跳转（兜底）
    allArticles.forEach((a, i) => {
        if (!a.url) a.url = `https://example.com/news/${i}`;
    });

    // 输出
    ensureDir(DATA_DIR);
    const output = {
        lastUpdate: new Date().toISOString(),
        totalArticles: allArticles.length,
        categories: CATEGORIES,
        articles: allArticles
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    log(`========== 数据保存成功：${OUTPUT_FILE} ==========`, 'success');
    log(`共 ${allArticles.length} 篇有效资讯，最后更新：${output.lastUpdate}`, 'success');

    // 统计分类
    const stats = {};
    allArticles.forEach(a => {
        stats[a.category] = (stats[a.category] || 0) + 1;
    });
    log('分类统计: ' + Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(', '), 'info');
}

main().catch(e => {
    log('严重错误：' + e.message, 'error');
    console.error(e);
    // 失败时至少生成示例数据，保证网站可用
    ensureDir(DATA_DIR);
    const articles = generateFallbackData();
    const output = {
        lastUpdate: new Date().toISOString(),
        totalArticles: articles.length,
        categories: CATEGORIES,
        articles
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    log('已保存兜底示例数据，网站可正常访问', 'warn');
    process.exit(0);
});
