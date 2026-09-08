/* ============================================
   NewsHub 资讯聚合 - 前端核心逻辑
   Vanilla JS, 无框架依赖
   ============================================ */

(function () {
    'use strict';

    // ---------- 配置常量 ----------
    const CONFIG = {
        ITEMS_PER_PAGE: 12,
        MAX_PAGES_SHOWN: 5,
        STORAGE_KEY: 'newshub_state',
        DATA_PATH: 'data/news.json',
        DEBOUNCE_DELAY: 300
    };

    const CATEGORY_LABELS = {
        all: '全部',
        business: '财经',
        technology: '科技',
        entertainment: '娱乐',
        sports: '体育',
        health: '健康',
        science: '科学',
        general: '综合'
    };

    const CATEGORY_ICONS = {
        business: '💰',
        technology: '💻',
        entertainment: '🎬',
        sports: '⚽',
        health: '🏥',
        science: '🔬',
        general: '📰',
        all: '📰'
    };

    // ---------- 全局状态 ----------
    const state = {
        allNews: [],
        filteredNews: [],
        currentCategory: 'all',
        searchQuery: '',
        currentPage: 1,
        lastUpdate: ''
    };

    // ---------- DOM 引用 ----------
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const dom = {
        newsGrid: $('#newsGrid'),
        loading: $('#loading'),
        errorMsg: $('#errorMsg'),
        emptyState: $('#emptyState'),
        pagination: $('#pagination'),
        pageNumbers: $('#pageNumbers'),
        prevBtn: $('#prevPage'),
        nextBtn: $('#nextPage'),
        searchInput: $('#searchInput'),
        searchBtn: $('#searchBtn'),
        categoryList: $('#categoryList'),
        themeToggle: $('#themeToggle'),
        mobileMenuBtn: $('#mobileMenuBtn'),
        searchBox: $('.search-box'),
        retryBtn: $('#retryBtn'),
        resultInfo: $('#resultInfo'),
        lastUpdate: $('#lastUpdate'),
        backToTop: $('#backToTop')
    };

    // ---------- 工具函数 ----------
    function debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function formatDate(dateStr) {
        if (!dateStr) return '未知';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '未知';
            const now = new Date();
            const diff = now - date;
            const mins = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            if (mins < 1) return '刚刚';
            if (mins < 60) return `${mins}分钟前`;
            if (hours < 24) return `${hours}小时前`;
            if (days < 7) return `${days}天前`;
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        } catch {
            return '未知';
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function truncate(str, len) {
        if (!str) return '';
        return str.length > len ? str.slice(0, len) + '...' : str;
    }

    // ---------- 主题管理 ----------
    function initTheme() {
        const saved = localStorage.getItem('newshub_theme');
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
        } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('newshub_theme', next);
    }

    // ---------- 数据加载 ----------
    async function loadNewsData() {
        showLoading(true);
        hide(dom.errorMsg);
        hide(dom.emptyState);
        hide(dom.pagination);

        try {
            const response = await fetch(CONFIG.DATA_PATH + '?t=' + Date.now(), {
                cache: 'no-cache'
            });
            if (!response.ok) throw new Error('数据加载失败');

            const data = await response.json();
            state.allNews = Array.isArray(data.articles) ? data.articles : [];
            state.lastUpdate = data.lastUpdate || '';

            if (state.allNews.length === 0) {
                throw new Error('暂无数据');
            }

            updateLastUpdate();
            applyFilters();
        } catch (err) {
            console.warn('加载预渲染数据失败，使用内置示例数据:', err.message);
            loadFallbackData();
        } finally {
            showLoading(false);
        }
    }

    function loadFallbackData() {
        state.allNews = generateSampleNews();
        state.lastUpdate = new Date().toISOString();
        updateLastUpdate();
        applyFilters();
    }

    function generateSampleNews() {
        const categories = ['technology', 'business', 'entertainment', 'sports', 'health', 'science'];
        const sources = ['新华社','人民日报','央视新闻','36氪','虎嗅','知乎日报','新浪科技','腾讯科技','网易','搜狐','界面新闻','第一财经','澎湃新闻','环球网','中新网','经济日报'];
        const titlesByCat = {
            technology:[
                'AI 大模型再突破：国产芯片推理性能提升 300%','苹果发布新一代 Vision Pro，售价大幅降低','量子计算机首次实现百万量子比特稳定运算','开源社区爆发式增长，开发者数量突破 3000 万','自动驾驶技术再升级，L4 级无人车正式商用','6G 研发取得关键进展，预计 2030 年前商用','新型电池技术充电 10 分钟续航 1000 公里','人机交互革命：脑机接口实现意念操控手机',
                '国产操作系统生态爆发，应用数量突破 500 万','全球首个 5G-A 网络正式商用，下行速率达 10Gbps','折叠屏手机市场份额突破 15%，价格下探至 3000 元','存储芯片价格触底反弹，行业进入新一轮上升周期','RISC-V 架构高性能处理器流片成功，性能追平同级别 ARM','AI 编程助手普及度超 80%，开发者效率提升 40%','智能穿戴设备新增血糖监测功能，医疗级认证通过','星链全球用户突破 500 万，卫星互联网时代来临',
                '智能眼镜 AR 光学方案革新，重量降至 30 克以下','全国一体化算力网建设提速，东数西算成效显著','光量子芯片量产工艺突破，良率提升至 60%','边缘计算节点部署超百万，工业互联网加速落地','类脑计算架构研究取得重要进展，能效比超 GPU 百倍','智能机器人柔性关节成本降 90%，家用机器人进入普及期','下一代 GPU 架构发布，AI 训练性能提升 4 倍','低代码平台市占率超 30%，企业数字化转型提速'
            ],
            business:[
                'A股三大指数集体走强，创业板指涨超 3%','新能源汽车出口量创新高，连续 12 个月全球第一','央行降准释放长期资金约 5000 亿元','全球产业链重构，中国制造向中国创造转型','跨境电商爆发式增长，年交易额突破 3 万亿','楼市新政出台，多城取消限购限贷','人民币国际化再提速，多国央行增持人民币资产','数字经济占 GDP 比重突破 40%，成为增长新引擎',
                '消费市场回暖，社零总额同比增长超预期','科技创新板 IPO 常态化，硬科技企业融资便利','黄金价格突破历史新高，避险情绪推动资金流入','公募基金规模突破 30 万亿，权益类占比回升','民营企业信心指数回升，新注册企业数同比增长 15%','外贸多元化战略见效，对新兴市场出口大幅增长','全国碳市场扩容，覆盖行业增至 8 个','基础设施 REITs 持续扩容，资产规模突破千亿',
                '专精特新小巨人企业超 12 万家，制造业升级提速','全国统一大市场建设加速，地方保护壁垒破除','消费券政策效果显现，节假日消费数据亮眼','半导体产业链投资超 5000 亿，国产化替代加速','绿色金融贷款余额突破 30 万亿，双碳目标推进','国企改革深化，战略性新兴产业资产占比提升','服务贸易创新发展试点扩围，数字服务出口增长','县域商业体系建设提速，农村消费潜力释放'
            ],
            entertainment:[
                '国产科幻电影票房破 50 亿，口碑票房双丰收','顶流歌手世界巡演开启，门票秒售罄','流媒体平台大战加剧，内容投入超千亿','国风文化破圈，汉服产业规模突破百亿','短视频用户规模突破 10 亿，日均使用超 3 小时','虚拟偶像走红，市场规模预计突破 200 亿','经典 IP 重制潮来袭，情怀牌能否持续奏效？','电竞入亚运会正式项目，产业迎来黄金发展期',
                '沉浸式剧场成新消费热点，全国门店超 3000 家','脱口秀从小众走向大众，线下演出市场规模翻倍','综艺节目创新破局，文化类节目口碑收视双高','网文出海收入超 50 亿，网文 IP 全球影响力扩大','音乐剧市场高速增长，年票房突破 50 亿','博物馆文创热销，考古盲盒系列销售额破亿','短剧行业爆发，年上线剧集超 10 万部','动漫产业规模突破 3000 亿，国漫崛起进行时',
                '直播电商生态完善，KOL 孵化体系成熟','游戏版号发放常态化，国产游戏出海成绩亮眼','数字藏品行业监管规范，合规平台探索新场景','演唱会市场报复性增长，年度票房破 200 亿','国潮品牌联名频出，传统文化年轻化表达受追捧','播客听众超 2 亿，耳朵经济成为新蓝海','影视工业化体系初步建成，视效制作成本下降','在线K歌用户超 5 亿，音乐社交场景持续创新'
            ],
            sports:[
                '中国队亚运会金牌数突破 200 枚，创造历史','中超联赛商业化改革，版权收入创新高','NBA 季后赛激战正酣，多支豪门爆冷出局','马拉松赛事井喷，全年赛事超过 2000 场','冬奥场馆再利用，群众冰雪运动普及加速','电竞产业规模突破 1800 亿，用户数超 5 亿','青少年体育培训市场火爆，政策引导规范发展','全民健身计划深入推进，人均体育场地面积提升',
                '女足留洋军团扩大，欧洲五大联赛均有中国球员','CBA 选秀质量提升，大学生球员成重要力量','网球中国赛季升级，大师赛永久落地上海','乒乓球世青赛包揽 7 金，梯队建设保持领先','羽毛球世锦赛国羽揽 3 金，新老交替顺利完成','游泳世锦赛多点开花，年轻选手惊喜不断','体操世锦赛金牌榜第一，难度质量双优势','女排联赛引入外援新规，竞争力全面提升',
                '三人篮球职业化加速，国家队世界排名稳居前列','霹雳舞正式入奥，街舞产业迎来发展机遇','体育用品出口创历史新高，国产品牌市占率超 60%','智慧场馆建设提速，观众观赛体验全面升级','越野跑赛事监管加强，安全保障体系完善','国家体育消费试点城市扩围，夜经济+体育融合','校园足球深化改革，青训体系多元发展','冲浪滑板等极限运动普及，小众运动大众化'
            ],
            health:[
                '新型疫苗研发成功，可预防多种呼吸道疾病','AI 辅助诊断准确率超 95%，基层医疗机构普及','中医药现代化取得突破，多个新药获批上市','心理健康受重视，专业咨询师需求激增','基因编辑技术治愈罕见遗传病，临床实验成功','长寿研究新发现：关键基因可延长寿命 30%','全民健康素养提升，健康管理市场规模超万亿','远程医疗覆盖九成县域，看病难问题缓解',
                '创新药医保谈判常态化，患者用药负担大幅下降','细胞治疗产品陆续获批，癌症治疗迈入新时代','医疗器械国产化加速，高端影像设备性能追平进口','互联网+慢病管理落地，患者复诊购药便利化','公共卫生体系补短板，疾控中心能力全面升级','中医药循证医学研究突破，国际化标准体系建立','儿童青少年近视防控成效显著，近视率首次下降','老年医学科建设提速，医养结合模式深入推广',
                '营养保健品行业规范发展，功能声称监管严格','罕见病用药保障机制完善，年新增用药超 50 种','医学检验结果互认全面推开，减少重复检查','康复医疗体系建设，康复床位数增长 50%','疫苗追溯体系全面建成，疫苗安全全程可控','医美行业强监管，合规机构加速替代黑医美','健康险产品创新，带病体可保产品增加','基层卫生人才队伍扩容，乡村医生待遇提升'
            ],
            science:[
                '中国空间站完成扩建，科学实验成果丰硕','嫦娥六号带回月球背面样本，发现新物质','可控核聚变研究突破：持续运行超 400 秒','暗物质探测卫星发现疑似暗物质信号','深海探测器突破 12000 米，到达马里亚纳海沟','基因测序成本降至百元级，精准医疗普及加速','新材料石墨烯大规模量产，应用场景持续拓展','人类基因组完整解读成功，医学进入新纪元',
                '脉冲星导航实验卫星升空，自主导航体系建成','太阳探测卫星发布首图，太阳风起源之谜解明','合成生物学技术爆发，人工合成淀粉量产落地','全球首台 E 级超算正式投运，算力领跑世界','干细胞治疗脊髓损伤临床试验取得突破','碳捕获新材料问世，捕集成本降低 80%','量子中继器关键技术突破，量子通信网络延伸','青藏高原二次科考完成，发现大量新物种',
                '引力波探测灵敏度提升三倍，宇宙演化线索浮现','脑连接图谱绘制完成，神经科学研究基石奠定','新一代大视场巡天望远镜开建，天文观测能力飞跃','纳米机器人精准递送药物进入临床前研究','高温超导机理研究达成共识，理论体系确立','二氧化碳人工合成糖技术取得重要进展','陨石中发现蛋白质等生物分子，生命起源添新证','全球气候模型预测精度提升，极端天气预警提前'
            ]
        };

        const news = [];
        const now = Date.now();
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

        let id = 0;
        const PER_CATEGORY = 34;
        for (const cat of categories) {
            const tlist = titlesByCat[cat];
            for (let i = 0; i < PER_CATEGORY; i++) {
                const base = tlist[i % tlist.length];
                const suffix = i >= tlist.length ? '（深度报道' + (i - tlist.length + 1) + '）' : '';
                const ts = now - (id * 3600000);
                news.push({
                    title: base + suffix,
                    description: `${base}${suffix}。这是一篇示例资讯，展示网站界面效果。部署配置真实 API 后将自动替换为来自 NewsAPI、GNews 等数据源的全球最新资讯，每天早上 8 点由 GitHub Actions 自动更新。点击卡片可跳转原文阅读完整报道，支持按分类筛选、关键词搜索、亮暗主题切换等功能。`,
                    category: cat,
                    source: sources[id % sources.length],
                    url: 'https://example.com/article/' + id,
                    image: images[id % images.length],
                    publishedAt: new Date(ts).toISOString()
                });
                id++;
            }
        }
        return news;
    }

    // ---------- 筛选与搜索 ----------
    function applyFilters() {
        const query = state.searchQuery.trim().toLowerCase();
        state.filteredNews = state.allNews.filter(item => {
            const matchCat = state.currentCategory === 'all' ||
                (item.category && item.category.toLowerCase() === state.currentCategory);
            if (!matchCat) return false;
            if (!query) return true;
            const title = (item.title || '').toLowerCase();
            const desc = (item.description || '').toLowerCase();
            const src = (item.source || '').toLowerCase();
            return title.includes(query) || desc.includes(query) || src.includes(query);
        });

        state.currentPage = 1;
        renderNews();
        renderPagination();
        updateResultInfo();
    }

    function updateResultInfo() {
        const total = state.filteredNews.length;
        const start = total === 0 ? 0 : (state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE + 1;
        const end = Math.min(state.currentPage * CONFIG.ITEMS_PER_PAGE, total);
        dom.resultInfo.textContent = total === 0
            ? '暂无资讯'
            : `共 ${total} 条资讯，显示 ${start}-${end}`;
    }

    function updateLastUpdate() {
        if (state.lastUpdate) {
            dom.lastUpdate.textContent = '🕒 更新于 ' + formatDate(state.lastUpdate);
        }
    }

    // ---------- 渲染 ----------
    function renderNews() {
        const { filteredNews, currentPage } = state;
        const start = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
        const end = start + CONFIG.ITEMS_PER_PAGE;
        const pageData = filteredNews.slice(start, end);

        if (pageData.length === 0) {
            dom.newsGrid.innerHTML = '';
            if (filteredNews.length === 0) {
                show(dom.emptyState);
            }
            return;
        }

        hide(dom.emptyState);
        dom.newsGrid.innerHTML = pageData.map(item => renderCard(item)).join('');
    }

    function renderCard(item) {
        const cat = item.category || 'general';
        const catLabel = CATEGORY_LABELS[cat] || '综合';
        const icon = CATEGORY_ICONS[cat] || '📰';
        const imgHtml = item.image
            ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="card-image-placeholder" style="display:none;">${icon}</div>`
            : `<div class="card-image-placeholder">${icon}</div>`;

        return `
            <article class="news-card" data-url="${escapeHtml(item.url || '#')}">
                <div class="card-image">
                    ${imgHtml}
                    <span class="card-category">${catLabel}</span>
                </div>
                <div class="card-body">
                    <h3 class="card-title">${escapeHtml(item.title || '无标题')}</h3>
                    <p class="card-description">${escapeHtml(truncate(item.description || '', 120))}</p>
                    <div class="card-footer">
                        <span class="card-source" title="${escapeHtml(item.source || '')}">${escapeHtml(item.source || '佚名')}</span>
                        <span class="card-date">${formatDate(item.publishedAt)}</span>
                    </div>
                </div>
            </article>
        `;
    }

    function renderPagination() {
        const totalPages = Math.ceil(state.filteredNews.length / CONFIG.ITEMS_PER_PAGE);
        if (totalPages <= 1) {
            hide(dom.pagination);
            return;
        }
        show(dom.pagination);

        const current = state.currentPage;
        dom.prevBtn.disabled = current === 1;
        dom.nextBtn.disabled = current === totalPages;

        let pages = [];
        const max = CONFIG.MAX_PAGES_SHOWN;
        let startP = Math.max(1, current - Math.floor(max / 2));
        let endP = startP + max - 1;
        if (endP > totalPages) {
            endP = totalPages;
            startP = Math.max(1, endP - max + 1);
        }

        if (startP > 1) {
            pages.push(1);
            if (startP > 2) pages.push('...');
        }
        for (let i = startP; i <= endP; i++) pages.push(i);
        if (endP < totalPages) {
            if (endP < totalPages - 1) pages.push('...');
            pages.push(totalPages);
        }

        dom.pageNumbers.innerHTML = pages.map(p =>
            p === '...'
                ? `<span class="page-ellipsis">...</span>`
                : `<button class="page-num ${p === current ? 'active' : ''}" data-page="${p}">${p}</button>`
        ).join('');
    }

    // ---------- 显示/隐藏 ----------
    function show(el) { el && el.classList.remove('hidden'); }
    function hide(el) { el && el.classList.add('hidden'); }
    function showLoading(visible) {
        if (visible) {
            show(dom.loading);
            dom.newsGrid.innerHTML = '';
        } else {
            hide(dom.loading);
        }
    }

    // ---------- 事件绑定 ----------
    function bindEvents() {
        // 分类切换
        dom.categoryList.addEventListener('click', (e) => {
            const btn = e.target.closest('.category-btn');
            if (!btn) return;
            $$('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentCategory = btn.dataset.category;
            applyFilters();
        });

        // 搜索
        const doSearch = debounce(() => {
            state.searchQuery = dom.searchInput.value;
            applyFilters();
        }, CONFIG.DEBOUNCE_DELAY);

        dom.searchInput.addEventListener('input', doSearch);
        dom.searchBtn.addEventListener('click', doSearch);
        dom.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSearch();
        });

        // 主题切换
        dom.themeToggle.addEventListener('click', toggleTheme);

        // 移动端菜单
        dom.mobileMenuBtn.addEventListener('click', () => {
            dom.searchBox.classList.toggle('show');
            if (dom.searchBox.classList.contains('show')) {
                dom.searchInput.focus();
            }
        });

        // 重新加载
        dom.retryBtn && dom.retryBtn.addEventListener('click', loadNewsData);

        // 卡片点击跳转
        dom.newsGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.news-card');
            if (!card) return;
            const url = card.dataset.url;
            if (url && url !== '#') {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        });

        // 分页
        dom.prevBtn.addEventListener('click', () => {
            if (state.currentPage > 1) {
                state.currentPage--;
                updatePage();
            }
        });
        dom.nextBtn.addEventListener('click', () => {
            const totalPages = Math.ceil(state.filteredNews.length / CONFIG.ITEMS_PER_PAGE);
            if (state.currentPage < totalPages) {
                state.currentPage++;
                updatePage();
            }
        });
        dom.pageNumbers.addEventListener('click', (e) => {
            const btn = e.target.closest('.page-num');
            if (!btn) return;
            state.currentPage = parseInt(btn.dataset.page, 10);
            updatePage();
        });

        // 返回顶部
        window.addEventListener('scroll', () => {
            if (window.scrollY > 400) {
                dom.backToTop.classList.remove('hidden');
            } else {
                dom.backToTop.classList.add('hidden');
            }
        });
        dom.backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    function updatePage() {
        renderNews();
        renderPagination();
        updateResultInfo();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ---------- 初始化 ----------
    async function init() {
        initTheme();
        bindEvents();
        await loadNewsData();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
