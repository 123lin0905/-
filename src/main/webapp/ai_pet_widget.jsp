<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<!-- ========================================== -->
<!-- 🌿 西南财经大学天府学院 · AI 绿化数字宠物【小天】组件 🌿 -->
<!-- ========================================== -->
<style>
    /* 萌宠浮动悬浮球容器 */
    .ai-pet-root {
        position: fixed;
        bottom: 26px;
        right: 26px;
        z-index: 99998;
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, sans-serif;
    }

    /* 萌宠常驻浮球主体 */
    .ai-pet-avatar-wrap {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        box-shadow: 0 10px 25px rgba(5, 150, 105, 0.42), 0 0 0 4px rgba(255, 255, 255, 0.95);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        user-select: none;
        animation: petFloat 4s ease-in-out infinite;
    }
    .ai-pet-avatar-wrap:hover {
        transform: scale(1.1) translateY(-4px);
        box-shadow: 0 16px 32px rgba(5, 150, 105, 0.52), 0 0 0 5px rgba(255, 255, 255, 1);
    }
    @keyframes petFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-7px); }
    }

    /* 萌宠头部嫩芽摆动动画 */
    .ai-pet-sprout {
        transform-origin: bottom center;
        animation: sproutSway 3s ease-in-out infinite;
    }
    @keyframes sproutSway {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(-8deg); }
        75% { transform: rotate(8deg); }
    }

    /* 萌宠灵动眨眼动画 */
    .ai-pet-eyes {
        animation: petBlink 4s infinite;
        transform-origin: center;
    }
    @keyframes petBlink {
        0%, 96%, 100% { transform: scaleY(1); }
        98% { transform: scaleY(0.1); }
    }

    /* 在线呼吸光环 */
    .ai-pet-online-beacon {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 14px;
        height: 14px;
        background: #22c55e;
        border: 2.5px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 0 rgba(34, 197, 94, 0.6);
        animation: petBeaconPulse 2s infinite;
    }
    @keyframes petBeaconPulse {
        0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
        70% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
        100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }

    /* 萌宠头顶常驻交互提示气泡 */
    .ai-pet-speech-bubble {
        position: absolute;
        bottom: 84px;
        right: 0;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #f8fafc;
        padding: 9px 14px;
        border-radius: 16px;
        font-size: 12.5px;
        font-weight: 600;
        line-height: 1.45;
        min-width: 190px;
        max-width: 270px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(52, 211, 153, 0.4);
        cursor: pointer;
        opacity: 0;
        transform: translateY(10px) scale(0.95);
        pointer-events: none;
        transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 99998;
    }
    .ai-pet-speech-bubble.show {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
    }
    .ai-pet-speech-bubble::after {
        content: '';
        position: absolute;
        bottom: -6px;
        right: 28px;
        width: 12px;
        height: 12px;
        background: rgba(15, 23, 42, 0.92);
        border-right: 1px solid rgba(52, 211, 153, 0.4);
        border-bottom: 1px solid rgba(52, 211, 153, 0.4);
        transform: rotate(45deg);
    }

    /* 智能对话视窗卡片 */
    .ai-pet-chat-box {
        position: fixed;
        bottom: 108px;
        right: 26px;
        width: 390px;
        height: 550px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 130px);
        background: rgba(255, 255, 255, 0.96);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1.5px solid rgba(16, 185, 129, 0.35);
        border-radius: 24px;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 99999;
        opacity: 0;
        pointer-events: none;
        transform: translateY(24px) scale(0.96);
        transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .ai-pet-chat-box.open {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0) scale(1);
    }

    /* 对话窗头部 */
    .ai-pet-chat-head {
        padding: 14px 18px;
        background: linear-gradient(135deg, #065f46 0%, #047857 100%);
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    }
    .ai-pet-head-left {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .ai-pet-head-avatar {
        width: 38px;
        height: 38px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1.5px solid rgba(255, 255, 255, 0.6);
    }
    .ai-pet-head-info h4 {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .ai-pet-head-info p {
        margin: 2px 0 0;
        font-size: 11.5px;
        color: #a7f3d0;
        display: flex;
        align-items: center;
        gap: 5px;
    }
    .ai-pet-head-actions {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .ai-pet-head-btn {
        background: rgba(255, 255, 255, 0.15);
        border: none;
        color: #ffffff;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
    }
    .ai-pet-head-btn:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    /* 实时数据库快照指标横幅 */
    .ai-pet-db-banner {
        background: #ecfdf5;
        border-bottom: 1px solid #d1fae5;
        padding: 7px 14px;
        font-size: 11.5px;
        color: #065f46;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-weight: 700;
    }
    .ai-pet-db-banner span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    /* 快捷提问探索胶囊栏 */
    .ai-pet-quick-chips {
        padding: 8px 12px;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: none;
    }
    .ai-pet-quick-chips::-webkit-scrollbar {
        display: none;
    }
    .ai-pet-chip {
        background: #ffffff;
        border: 1px solid #cbd5e1;
        color: #334155;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
    }
    .ai-pet-chip:hover {
        background: #059669;
        border-color: #059669;
        color: #ffffff;
        transform: translateY(-1px);
    }

    /* 消息对话滚动区 */
    .ai-pet-messages-area {
        flex: 1;
        overflow-y: auto;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #f8fafc;
    }
    .ai-pet-msg-row {
        display: flex;
        gap: 8px;
        align-items: flex-start;
    }
    .ai-pet-msg-row.user {
        justify-content: flex-end;
    }
    .ai-pet-msg-avatar {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #10b981;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
        margin-top: 2px;
    }
    .ai-pet-msg-bubble {
        max-width: 84%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 13px;
        line-height: 1.55;
        word-break: break-word;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }
    .ai-pet-msg-row.ai .ai-pet-msg-bubble {
        background: #ffffff;
        color: #1e293b;
        border: 1px solid #e2e8f0;
        border-top-left-radius: 4px;
    }
    .ai-pet-msg-row.user .ai-pet-msg-bubble {
        background: linear-gradient(135deg, #059669 0%, #10b981 100%);
        color: #ffffff;
        border-top-right-radius: 4px;
    }

    /* Markdown 元素样式微调 */
    .ai-pet-msg-bubble p {
        margin: 0 0 6px;
    }
    .ai-pet-msg-bubble p:last-child {
        margin: 0;
    }
    .ai-pet-msg-bubble ul, .ai-pet-msg-bubble ol {
        margin: 4px 0 6px 18px;
        padding: 0;
    }
    .ai-pet-msg-bubble li {
        margin-bottom: 3px;
    }
    .ai-pet-msg-bubble strong {
        color: #047857;
    }
    .ai-pet-msg-row.user .ai-pet-msg-bubble strong {
        color: #ffffff;
    }
    .ai-pet-action-pill {
        display: inline-block;
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
        padding: 2px 8px;
        border-radius: 8px;
        font-size: 11.5px;
        font-weight: 700;
        margin: 2px 2px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .ai-pet-action-pill:hover {
        background: #059669;
        color: #ffffff;
        border-color: #059669;
    }

    /* 思考中打字指示器 */
    .ai-pet-typing {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
    }
    .ai-pet-dot {
        width: 6px;
        height: 6px;
        background: #10b981;
        border-radius: 50%;
        animation: typingDot 1.4s infinite ease-in-out both;
    }
    .ai-pet-dot:nth-child(1) { animation-delay: -0.32s; }
    .ai-pet-dot:nth-child(2) { animation-delay: -0.16s; }
    @keyframes typingDot {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1.15); opacity: 1; }
    }

    /* 输入区域 */
    .ai-pet-input-bar {
        padding: 12px 14px;
        background: #ffffff;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 8px;
        align-items: center;
    }
    .ai-pet-input {
        flex: 1;
        border: 1.5px solid #cbd5e1;
        border-radius: 20px;
        padding: 8px 14px;
        font-size: 13px;
        outline: none;
        transition: all 0.2s;
        background: #f8fafc;
    }
    .ai-pet-input:focus {
        border-color: #10b981;
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    }
    .ai-pet-send-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #059669, #10b981);
        border: none;
        color: #ffffff;
        font-size: 15px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
    }
    .ai-pet-send-btn:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 16px rgba(5, 150, 105, 0.45);
    }
    .ai-pet-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
    }
</style>

<!-- 🌿 萌宠 DOM 结构 -->
<div class="ai-pet-root" id="aiPetRoot">
    <!-- 常驻气泡提示 -->
    <div class="ai-pet-speech-bubble" id="aiPetSpeechBubble" onclick="toggleAiPetChat()">
        <span id="aiPetSpeechText">主人好呀！我是天府绿化小管家【小天】🌱~ 点击我了解整个系统与绿植数据哦！</span>
    </div>

    <!-- 萌宠身体与头像 -->
    <div class="ai-pet-avatar-wrap" id="aiPetAvatar" onclick="toggleAiPetChat()" title="点击与 AI 绿植小精灵小天对话">
        <div class="ai-pet-online-beacon" title="实时连接 MySQL 数据库"></div>
        <!-- 萌宠矢量绘制 SVG -->
        <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- 头顶嫩芽 -->
            <g class="ai-pet-sprout">
                <path d="M32 20C32 20 30 11 23 11C23 15 27 18 32 20Z" fill="#34d399"/>
                <path d="M32 20C32 20 35 7 43 9C43 14 38 18 32 20Z" fill="#6ee7b7"/>
                <path d="M32 20V23" stroke="#059669" stroke-width="2" stroke-linecap="round"/>
            </g>
            <!-- 身体球体 -->
            <ellipse cx="32" cy="38" rx="22" ry="19" fill="#10b981"/>
            <ellipse cx="32" cy="36" rx="20" ry="17" fill="url(#petGrad)"/>
            <!-- 腮红 -->
            <ellipse cx="19" cy="40" rx="3.5" ry="2" fill="#f472b6" opacity="0.75"/>
            <ellipse cx="45" cy="40" rx="3.5" ry="2" fill="#f472b6" opacity="0.75"/>
            <!-- 眼睛 -->
            <g class="ai-pet-eyes">
                <ellipse cx="24" cy="34" rx="2.5" ry="3.5" fill="#0f172a"/>
                <circle cx="23.2" cy="33" r="1" fill="#ffffff"/>
                <ellipse cx="40" cy="34" rx="2.5" ry="3.5" fill="#0f172a"/>
                <circle cx="39.2" cy="33" r="1" fill="#ffffff"/>
            </g>
            <!-- 微笑小嘴 -->
            <path d="M29 39C30.5 41 33.5 41 35 39" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round"/>
            <!-- 渐变定义 -->
            <defs>
                <linearGradient id="petGrad" x1="16" y1="20" x2="48" y2="52" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#34d399"/>
                    <stop offset="1" stop-color="#059669"/>
                </linearGradient>
            </defs>
        </svg>
    </div>

    <!-- 萌宠展开后的智能对话视窗 -->
    <div class="ai-pet-chat-box" id="aiPetChatBox">
        <div class="ai-pet-chat-head">
            <div class="ai-pet-head-left">
                <div class="ai-pet-head-avatar">🌱</div>
                <div class="ai-pet-head-info">
                    <h4>AI 绿植管家 · 小天</h4>
                    <p>● 实时互联 MySQL · 智能大模型</p>
                </div>
            </div>
            <div class="ai-pet-head-actions">
                <button type="button" class="ai-pet-head-btn" onclick="clearAiPetChat()" title="清空对话记录">🔄</button>
                <button type="button" class="ai-pet-head-btn" onclick="toggleAiPetChat()" title="最小化">➖</button>
            </div>
        </div>

        <!-- 实时数据库微指标栏 -->
        <div class="ai-pet-db-banner" id="aiPetDbBanner">
            <span>🌿 绿植: <b id="aiStatPlants">0</b> 棵</span>
            <span>🐾 动物: <b id="aiStatAnimals">0</b> 类</span>
            <span>🚨 预警: <b id="aiStatWarnings" style="color:#dc2626;">0</b> 棵</span>
            <span>👤 养护: <b id="aiStatWorkers">0</b> 人</span>
        </div>

        <!-- 快捷探索与指令胶囊 -->
        <div class="ai-pet-quick-chips">
            <span class="ai-pet-chip" onclick="askAiPet('帮我添加一棵树：名称香樟，类别乔木，单株估值1200元')">➕ 帮我添加一棵香樟树</span>
            <span class="ai-pet-chip" onclick="askAiPet('帮我添加两只动物：天府黑天鹅，水禽鸟类')">🦢 帮我添加两只黑天鹅</span>
            <span class="ai-pet-chip" onclick="askAiPet('帮我为校园重点绿植打卡完成一次晨间浇水养护作业')">💧 帮我打卡浇水作业</span>
            <span class="ai-pet-chip" onclick="askAiPet('帮我移除一棵测试树木')">🗑️ 帮我移除一棵树</span>
            <span class="ai-pet-chip" onclick="askAiPet('向我全面汇报一下全校的植物与生态动物概况！')">🌿 全校动植物概况</span>
            <span class="ai-pet-chip" onclick="askAiPet('当前数据库中有哪些临期或超期待养护的作物？')">🚨 待养护预警清单</span>
        </div>

        <!-- 聊天对话区域 -->
        <div class="ai-pet-messages-area" id="aiPetMessagesArea">
            <div class="ai-pet-msg-row ai">
                <div class="ai-pet-msg-avatar">🌱</div>
                <div class="ai-pet-msg-bubble" id="aiPetWelcomeBubble">
                    <p>主人好呀！我是天府学院智慧绿化管家【小天】🌱~</p>
                    <p>我已经实时连通了学校的底层 <strong>MySQL 数据库 (plant)</strong>。您可以问我任何关于：</p>
                    <ul>
                        <li>全校绿植资产数量与各校区分布</li>
                        <li>各作物的浇水/施肥/修剪健康预警</li>
                        <li>绿化养护员队伍的职责与分工</li>
                        <li>系统各项功能的操作指南（如标绘、拖拽调位等）</li>
                    </ul>
                    <p style="margin-top:6px;font-size:12px;color:#059669;">💡 点击上方快捷探索胶囊，或直接在下方输入提问哦！</p>
                </div>
            </div>
        </div>

        <!-- 底部输入框 -->
        <div class="ai-pet-input-bar">
            <input type="text" class="ai-pet-input" id="aiPetUserInput" placeholder="问小天任何关于绿植、人员或系统的问题..." onkeydown="handleAiPetKeyDown(event)">
            <button type="button" class="ai-pet-send-btn" id="aiPetSendBtn" onclick="submitAiPetMessage()" title="发送问题">🚀</button>
        </div>
    </div>
</div>

<script>
    // ==========================================
    // 🐾 AI 绿化小精灵【小天】前端交互与数据流
    // ==========================================
    let isAiPetChatOpen = false;
    let isAiPetGenerating = false;
    let aiPetTips = [
        "主人好！我是天府绿植小精灵小天🌱，点我随时为您介绍系统与解答绿植疑问哦！",
        "💡 校园绿植实时数据库已连接，想了解绵阳、德阳校区随时问我~",
        "🚨 有小天帮您监测临期与超期作物，养护管理超省心！",
        "🗺️ 想在地图上栽植新树苗？点我教您一步步操作！",
        "👤 想查哪位师傅负责哪棵树？问我就对啦~"
    ];
    let aiPetTipIndex = 0;

    // 页面加载就绪后初始化
    window.addEventListener('DOMContentLoaded', () => {
        initAiPet();
    });

    function initAiPet() {
        // 1. 异步从 Servlet 获取数据库实时摘要
        fetch('AiPetServlet?action=summary')
            .then(r => r.json())
            .then(res => {
                if (res.success && res.stats) {
                    updateAiPetDbStats(res.stats);
                    if (res.greeting) {
                        const bubbleText = document.getElementById('aiPetSpeechText');
                        if (bubbleText) bubbleText.textContent = res.greeting;
                    }
                }
            })
            .catch(err => {
                console.warn('读取 AI 宠物快照失败:', err);
            });

        // 2. 初始延迟弹出头顶气泡
        setTimeout(() => {
            showAiPetBubble();
        }, 1200);

        // 3. 定时轮播小贴士
        setInterval(() => {
            if (!isAiPetChatOpen) {
                aiPetTipIndex = (aiPetTipIndex + 1) % aiPetTips.length;
                const bubbleText = document.getElementById('aiPetSpeechText');
                if (bubbleText) bubbleText.textContent = aiPetTips[aiPetTipIndex];
                showAiPetBubble();
            }
        }, 18000);
    }

    function showAiPetBubble() {
        const bubble = document.getElementById('aiPetSpeechBubble');
        if (bubble && !isAiPetChatOpen) {
            bubble.classList.add('show');
            setTimeout(() => {
                if (!isAiPetChatOpen) bubble.classList.remove('show');
            }, 6000);
        }
    }

    function toggleAiPetChat() {
        isAiPetChatOpen = !isAiPetChatOpen;
        const box = document.getElementById('aiPetChatBox');
        const bubble = document.getElementById('aiPetSpeechBubble');
        if (box) {
            if (isAiPetChatOpen) {
                box.classList.add('open');
                if (bubble) bubble.classList.remove('show');
                const input = document.getElementById('aiPetUserInput');
                if (input) setTimeout(() => input.focus(), 200);
            } else {
                box.classList.remove('open');
            }
        }
    }

    function clearAiPetChat() {
        const area = document.getElementById('aiPetMessagesArea');
        if (area) {
            area.innerHTML = `
                <div class="ai-pet-msg-row ai">
                    <div class="ai-pet-msg-avatar">🌱</div>
                    <div class="ai-pet-msg-bubble">
                        <p>对话记录已清空！主人，有什么新的问题要考考小天吗？🍃</p>
                    </div>
                </div>
            `;
        }
    }

    function updateAiPetDbStats(stats) {
        const pEl = document.getElementById('aiStatPlants');
        const aEl = document.getElementById('aiStatAnimals');
        const wEl = document.getElementById('aiStatWarnings');
        const mEl = document.getElementById('aiStatWorkers');
        if (pEl) pEl.textContent = stats.totalPlants || 0;
        if (aEl) aEl.textContent = stats.totalAnimalSpecies || 0;
        if (wEl) wEl.textContent = (stats.dueCount || 0) + (stats.overdueCount || 0);
        if (mEl) mEl.textContent = stats.maintainerCount || 0;
    }

    function handleAiPetKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitAiPetMessage();
        }
    }

    function askAiPet(promptText) {
        if (!isAiPetChatOpen) toggleAiPetChat();
        const input = document.getElementById('aiPetUserInput');
        if (input) input.value = promptText;
        submitAiPetMessage();
    }

    function submitAiPetMessage() {
        if (isAiPetGenerating) return;
        const input = document.getElementById('aiPetUserInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        appendAiPetMessage('user', text);

        isAiPetGenerating = true;
        const sendBtn = document.getElementById('aiPetSendBtn');
        if (sendBtn) sendBtn.disabled = true;

        // 添加打字中占位气泡
        const loadingId = 'aiLoadingBubble_' + Date.now();
        appendAiPetLoadingBubble(loadingId);

        const params = new URLSearchParams();
        params.append('message', text);

        fetch('AiPetServlet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: params.toString()
        })
        .then(r => r.json())
        .then(res => {
            removeAiPetLoadingBubble(loadingId);
            isAiPetGenerating = false;
            if (sendBtn) sendBtn.disabled = false;

            if (res.success && res.reply) {
                appendAiPetMessage('ai', res.reply, res.actionResult);
                if (res.stats) updateAiPetDbStats(res.stats);
            } else {
                appendAiPetMessage('ai', '⚠️ 小天连接知识库出了点小问题：' + (res.message || '请稍后再试'));
            }
        })
        .catch(err => {
            removeAiPetLoadingBubble(loadingId);
            isAiPetGenerating = false;
            if (sendBtn) sendBtn.disabled = false;
            appendAiPetMessage('ai', '⚠️ 网络连接暂时中断，请检查网络或稍后再问小天吧~ (' + err.message + ')');
        });
    }

    function appendAiPetMessage(role, text, actionResult) {
        const area = document.getElementById('aiPetMessagesArea');
        if (!area) return;

        const row = document.createElement('div');
        row.className = 'ai-pet-msg-row ' + role;

        if (role === 'ai') {
            const avatar = document.createElement('div');
            avatar.className = 'ai-pet-msg-avatar';
            avatar.textContent = '🌱';
            row.appendChild(avatar);

            const bubble = document.createElement('div');
            bubble.className = 'ai-pet-msg-bubble';
            
            let contentHtml = renderAiPetMarkdown(text);
            if (actionResult && actionResult.executed) {
                // 若当前页面存在实景地图，自动无感实时重新加载并平移聚焦
                if (typeof window.reloadMapEcoData === 'function') {
                    window.reloadMapEcoData(actionResult);
                }
                // 派发全局指令事件供其它组件联动
                window.dispatchEvent(new CustomEvent('ai-crop-modified', { detail: actionResult }));

                const hasMap = typeof window.reloadMapEcoData === 'function';
                const buttonHtml = hasMap
                    ? `<button type="button" onclick="if(window.reloadMapEcoData) window.reloadMapEcoData();" style="background:#059669;color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:11.5px;font-weight:bold;cursor:pointer;white-space:nowrap;">🚀 地图已自动同步</button>`
                    : `<button type="button" onclick="window.location.reload()" style="background:#059669;color:#fff;border:none;padding:5px 12px;border-radius:6px;font-size:11.5px;font-weight:bold;cursor:pointer;white-space:nowrap;">🔄 刷新数据</button>`;

                contentHtml += `
                    <div style="margin-top:12px;padding:10px 12px;background:#ecfdf5;border:1.5px solid #10b981;border-radius:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span style="font-size:12px;color:#065f46;font-weight:700;">
                            ✨ 【MySQL 实时生效】` + (actionResult.message || '') + `
                        </span>
                        ` + buttonHtml + `
                    </div>
                `;
            }
            bubble.innerHTML = contentHtml;
            row.appendChild(bubble);
        } else {
            const bubble = document.createElement('div');
            bubble.className = 'ai-pet-msg-bubble';
            bubble.textContent = text;
            row.appendChild(bubble);
        }

        area.appendChild(row);
        area.scrollTop = area.scrollHeight;
    }

    function appendAiPetLoadingBubble(id) {
        const area = document.getElementById('aiPetMessagesArea');
        if (!area) return;

        const row = document.createElement('div');
        row.className = 'ai-pet-msg-row ai';
        row.id = id;

        const avatar = document.createElement('div');
        avatar.className = 'ai-pet-msg-avatar';
        avatar.textContent = '🌱';
        row.appendChild(avatar);

        const bubble = document.createElement('div');
        bubble.className = 'ai-pet-msg-bubble';
        bubble.innerHTML = `
            <div style="font-size:12px;color:#059669;font-weight:600;display:flex;align-items:center;gap:6px;">
                <span>小天正在查询数据库并思考中... 🍃</span>
                <span class="ai-pet-typing">
                    <span class="ai-pet-dot"></span>
                    <span class="ai-pet-dot"></span>
                    <span class="ai-pet-dot"></span>
                </span>
            </div>
        `;
        row.appendChild(bubble);

        area.appendChild(row);
        area.scrollTop = area.scrollHeight;
    }

    function removeAiPetLoadingBubble(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // 轻量级 Markdown 语法解析渲染
    function renderAiPetMarkdown(raw) {
        if (!raw) return '';
        let escaped = raw
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // 加粗 **xxx**
        escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // 代码 `xxx`
        escaped = escaped.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 5px;border-radius:4px;color:#0f766e;font-size:12px;">$1</code>');

        // 识别校区/快捷动作关键词生成可点击药丸
        escaped = escaped.replace(/(【绵阳校区】|绵阳校区)/g, '$1 <span class="ai-pet-action-pill" onclick="aiPetGoCampus(\'mianyang\')">📍去绵阳</span>');
        escaped = escaped.replace(/(【德阳校区】|德阳校区)/g, '$1 <span class="ai-pet-action-pill" onclick="aiPetGoCampus(\'deyang\')">📍去德阳</span>');
        escaped = escaped.replace(/(【成都校区（东区）】|成都东区)/g, '$1 <span class="ai-pet-action-pill" onclick="aiPetGoCampus(\'chengdu_east\')">📍去东区</span>');
        escaped = escaped.replace(/(【成都校区（西区）】|成都西区)/g, '$1 <span class="ai-pet-action-pill" onclick="aiPetGoCampus(\'chengdu_west\')">📍去西区</span>');

        // 换行分段
        const lines = escaped.split('\n');
        let html = '';
        let inList = false;

        for (let line of lines) {
            line = line.trim();
            if (!line) {
                if (inList) { html += '</ul>'; inList = false; }
                continue;
            }

            if (line.startsWith('* ') || line.startsWith('- ')) {
                if (!inList) { html += '<ul>'; inList = true; }
                html += '<li>' + line.substring(2) + '</li>';
            } else if (/^\d+\.\s/.test(line)) {
                if (inList) { html += '</ul>'; inList = false; }
                html += '<p style="margin:3px 0;">' + line + '</p>';
            } else {
                if (inList) { html += '</ul>'; inList = false; }
                html += '<p>' + line + '</p>';
            }
        }
        if (inList) html += '</ul>';

        return html;
    }

    // 智能联动地图校区跳转
    function aiPetGoCampus(key) {
        if (typeof selectCampus === 'function') {
            selectCampus(key, true);
            showToast('🗺️ 小天已为您平滑切换到对应校区地图！', 'success');
        } else if (window.location.pathname.indexOf('area.jsp') === -1) {
            window.location.href = 'AreaServlet';
        }
    }
</script>
