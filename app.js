// 全局变量
let web3;
let diceGameContract;
let currentAccount;
const CONTRACT_ADDRESS = "0x2a5eB5f0884DAE980f7d6b9fA1Ce70B9656101cf";
let CONTRACT_ABI;
let selectedBetType = null;
let resultDice = document.getElementById('resultDice');
let fireworksCanvas = document.getElementById('fireworksCanvas');
let fireworksCtx = fireworksCanvas.getContext('2d');

// 初始化Canvas尺寸
function resizeCanvas() {
    fireworksCanvas.width = window.innerWidth;
    fireworksCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();



// DOM元素
const connectWalletBtn = document.getElementById('connectWalletBtn');
const walletStatus = document.getElementById('walletStatus');
const networkStatus = document.getElementById('networkStatus');
const walletBalance = document.getElementById('walletBalance');
const betAmountInput = document.getElementById('betAmount');
const diceBtns = document.querySelectorAll('.dice-select');
const placeBetBtn = document.getElementById('placeBetBtn');
const betStatus = document.getElementById('betStatus');
const diceNumber = document.getElementById('diceNumber');
const betResult = document.getElementById('betResult');
const payoutAmount = document.getElementById('payoutAmount');
const refreshStatsBtn = document.getElementById('refreshStatsBtn');
const totalGames = document.getElementById('totalGames');
const winGames = document.getElementById('winGames');
const winRate = document.getElementById('winRate');
const totalBet = document.getElementById('totalBet');
const totalWin = document.getElementById('totalWin');
const pageNumInput = document.getElementById('pageNum');
const pageSizeInput = document.getElementById('pageSize');
const loadRecordsBtn = document.getElementById('loadRecordsBtn');
const recordsList = document.getElementById('recordsList');
const loadRankingBtn = document.getElementById('loadRankingBtn');
const rankingList = document.getElementById('rankingList');
const gameOverlay = document.getElementById('gameOverlay');
const overlayContent = document.getElementById('overlayContent');

// 音效（可选，如果有文件的话）
// const winSound = new Audio('win.mp3');
// const loseSound = new Audio('lose.mp3');

// 初始化
window.addEventListener('DOMContentLoaded', async () => {
    // 加载ABI
    try {
        const response = await fetch('./abi.json');
        CONTRACT_ABI = await response.json();
    } catch (err) {
        console.error('加载ABI失败:', err);
        walletStatus.textContent = '加载资源失败，请刷新页面';
        walletStatus.style.color = '#ff0000';
        return;
    }

    // 检查MetaMask
    if (typeof window.ethereum !== 'undefined') {
        web3 = new Web3(window.ethereum);
        window.ethereum.on('chainChanged', () => window.location.reload());
        window.ethereum.on('accountsChanged', (accounts) => {
            currentAccount = accounts.length > 0 ? accounts[0] : null;
            updateWalletStatus();
            refreshPlayerStats();
            resetDiceSelection();
        });
    } else {
        walletStatus.textContent = '未安装MetaMask！';
        walletStatus.style.color = '#ff0000';
    }

    // 绑定事件
    connectWalletBtn.addEventListener('click', connectWallet);
    diceBtns.forEach(btn => btn.addEventListener('click', selectDiceType));
    betAmountInput.addEventListener('input', updateBetButtonStatus);
    placeBetBtn.addEventListener('click', placeBet);
    refreshStatsBtn.addEventListener('click', refreshPlayerStats);
    loadRecordsBtn.addEventListener('click', loadGameRecords);
    loadRankingBtn.addEventListener('click', loadRanking);

    // 检查已连接钱包
    try {
        const accounts = await web3.eth.getAccounts();
        if (accounts.length > 0) {
            currentAccount = accounts[0];
            initContract();
            updateWalletStatus();
            refreshPlayerStats();
        }
    } catch (error) {
        console.error('检查钱包失败:', error);
    }

    resetDiceSelection();
    updateBetButtonStatus();
});

// 选择骰子类型（大小）
function selectDiceType() {
    diceBtns.forEach(btn => btn.classList.remove('selected'));
    this.classList.add('selected');
    selectedBetType = parseInt(this.dataset.type);
    updateBetButtonStatus();
}

// 重置骰子选择
function resetDiceSelection() {
    diceBtns.forEach(btn => btn.classList.remove('selected'));
    selectedBetType = null;
    resultDice.classList.remove('spinning');
    diceNumber.textContent = '-';
    betResult.textContent = '-';
    payoutAmount.textContent = '-';
}

// 更新投注按钮状态
function updateBetButtonStatus() {
    placeBetBtn.disabled = !currentAccount || selectedBetType === null || !betAmountInput.value;
}

// 连接钱包
async function connectWallet() {
    try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        currentAccount = accounts[0];
        initContract();
        updateWalletStatus();
        refreshPlayerStats();
        betStatus.textContent = '';
    } catch (error) {
        console.error('连接钱包失败:', error);
        walletStatus.textContent = '连接失败: ' + error.message;
        walletStatus.style.color = '#ff0000';
        // 故障闪烁效果
        walletStatus.classList.add('failure');
        setTimeout(() => walletStatus.classList.remove('failure'), 2000);
    }
}

// 初始化合约
function initContract() {
    diceGameContract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
}

// 更新钱包状态
async function updateWalletStatus() {
    if (currentAccount) {
        walletStatus.textContent = `${currentAccount.substring(0, 6)}...${currentAccount.substring(38)}`;
        walletStatus.style.color = '#00ffea';
        
        // 获取并显示余额
        try {
            const balanceWei = await web3.eth.getBalance(currentAccount);
            const balanceETH = parseFloat(web3.utils.fromWei(balanceWei, 'ether')).toFixed(4);
            walletBalance.textContent = `${balanceETH} ETH`;
        } catch (e) {
            walletBalance.textContent = '-- ETH';
        }
        
        const chainId = await web3.eth.getChainId();
        let networkName;
        switch (chainId) {
            case 1n: networkName = 'Mainnet'; break;
            case 5n: networkName = 'Goerli'; break;
            case 11155111n: networkName = 'Sepolia'; break;
            default: networkName = `Chain ${chainId}`;
        }
        networkStatus.textContent = networkName;
    } else {
        walletStatus.textContent = '未连接';
        walletStatus.style.color = '#ff00ff';
        networkStatus.textContent = 'Sepolia';
        walletBalance.textContent = '-- ETH';
    }
}

// 投注核心逻辑（含动画）
async function placeBet() {
    if (!currentAccount || selectedBetType === null || !betAmountInput.value) {
        betStatus.textContent = '请填写金额并选择大小！';
        betStatus.style.color = '#ff0000';
        betStatus.classList.add('failure');
        setTimeout(() => betStatus.classList.remove('failure'), 1000);
        return;
    }

    // 获取合约投注限制
    const [contractMinBet, contractMaxBet] = await Promise.all([
        diceGameContract.methods.minBetAmount().call(),
        diceGameContract.methods.maxBetAmount().call()
    ]);
    const inputBetWei = parseFloat(betAmountInput.value);
    if (inputBetWei < parseFloat(contractMinBet) || inputBetWei > parseFloat(contractMaxBet)) {
        betStatus.textContent = `金额需在 ${contractMinBet} - ${contractMaxBet} wei 之间！`;
        betStatus.style.color = '#ff0000';
        betStatus.classList.add('failure');
        setTimeout(() => betStatus.classList.remove('failure'), 2000);
        return;
    }

    // 检查黑名单
    const isBlacklisted = await diceGameContract.methods.isBlacklisted(currentAccount).call();
    if (isBlacklisted) {
        betStatus.textContent = '账户已被限制投注！';
        betStatus.style.color = '#ff0000';
        betStatus.classList.add('failure');
        setTimeout(() => betStatus.classList.remove('failure'), 2000);
        return;
    }

    try {
        // 启动骰子旋转动画
        resultDice.classList.add('spinning');
        betStatus.textContent = '交易处理中...';
        betStatus.style.color = '#ffff00';
        placeBetBtn.disabled = true;

        // 发送投注交易
        const tx = await diceGameContract.methods.placeBet(selectedBetType)
            .send({ from: currentAccount, value: betAmountInput.value, gas: 300000 });

        // 停止旋转动画
        resultDice.classList.remove('spinning');

        // 解析结果
        const gameResultEvent = tx.events.GameResult;
        if (gameResultEvent) {
            const { diceNumber: dice, result, payout } = gameResultEvent.returnValues;
            
            // 设置结果骰子朝向
            setDiceFace(parseInt(dice));
            
            // 更新结果显示
            diceNumber.textContent = dice;
            payoutAmount.textContent = payout;
            
            if (result === '0') { // 胜利
                betResult.textContent = '胜利';
                betResult.style.color = '#00ff00';
                betStatus.textContent = '投注成功！恭喜获胜！';
                betStatus.style.color = '#00ff00';
                
                // 触发胜利组合动画
                launchFireworks();
                launchCoinRain();
                showOverlayAnimation('win', 'WINNER!');
                
            } else if (result === '1') { // 失败
                betResult.textContent = '失败';
                betResult.style.color = '#ff0000';
                betStatus.textContent = '投注成功！很遗憾输掉了游戏。';
                betStatus.style.color = '#ff0000';
                
                // 触发失败组合动画
                shakeScreen();
                showOverlayAnimation('lose', '下次一定行!');
                
            } else { // 退款
                betResult.textContent = '退款';
                betResult.style.color = '#ffa500';
                betStatus.textContent = '投注成功！已退款。';
                betStatus.style.color = '#ffa500';
            }
        }

        // 刷新战绩（带打字机效果）
        refreshPlayerStats(true);
    } catch (error) {
        console.error('投注失败:', error);
        resultDice.classList.remove('spinning');
        betStatus.textContent = '投注失败: ' + error.message;
        betStatus.style.color = '#ff0000';
        betStatus.classList.add('failure');
        setTimeout(() => betStatus.classList.remove('failure'), 3000);
        diceNumber.textContent = '-';
        betResult.textContent = '-';
        payoutAmount.textContent = '-';
    } finally {
        placeBetBtn.disabled = false;
    }
}

// 设置骰子显示的面 - 拟真3D版本
function setDiceFace(number) {
    // 强制移除动画类，确保 transform 生效
    resultDice.classList.remove('spinning');
    // 强制重绘，确保动画完全停止
    void resultDice.offsetWidth;
    
    /*
     * 骰子面的3D位置定义（CSS中）:
     * face-1: translateZ(40px)           -> 正前方
     * face-2: rotateY(90deg) translateZ  -> 右侧
     * face-3: rotateY(180deg) translateZ -> 背面 (需要rotateY(180deg)才能看到)
     * face-4: rotateY(-90deg) translateZ -> 左侧
     * face-5: rotateX(90deg) translateZ  -> 顶部 (需要rotateX(-90deg)才能看到)
     * face-6: rotateX(-90deg) translateZ -> 底部 (需要rotateX(90deg)才能看到)
     * 
     * 要让某个面正对用户，需要对骰子整体进行反向旋转
     */
    
    let baseTransform;
    switch (number) {
        case 1: 
            // face-1 已经在正前方，不需要旋转
            baseTransform = 'rotateX(0deg) rotateY(0deg)'; 
            break;
        case 2: 
            // face-2 在右侧，需要骰子向左转90度
            baseTransform = 'rotateY(-90deg)'; 
            break;
        case 3: 
            // face-3 在背面，需要骰子转180度
            baseTransform = 'rotateY(180deg)'; 
            break;
        case 4: 
            // face-4 在左侧，需要骰子向右转90度
            baseTransform = 'rotateY(90deg)'; 
            break;
        case 5: 
            // face-5 在顶部，需要骰子向下翻90度
            baseTransform = 'rotateX(-90deg)'; 
            break;
        case 6: 
            // face-6 在底部，需要骰子向上翻90度
            baseTransform = 'rotateX(90deg)'; 
            break;
        default: 
            baseTransform = 'rotateX(0deg) rotateY(0deg)';
    }
    
    // 添加轻微的倾斜角度，让用户能看到骰子的立体边角
    // 但不要太大，确保点数面仍然清晰可辨
    // 使用固定的倾斜角度，避免随机值导致视觉不一致
    const tiltX = -15; // 稍微向下倾斜，露出顶边
    const tiltY = 20;  // 稍微向右倾斜，露出右边
    
    // 组合变换：先应用基础旋转让目标面朝前，再叠加轻微倾斜展示立体感
    // 注意：CSS transform 从右向左执行，所以倾斜写在后面（先执行），基础旋转写在前面（后执行）
    // 但我们希望的效果是：先把正确的面转到前面，再整体倾斜
    // 所以应该是：先倾斜视角，再转面 -> tilt 写在 base 前面
    // 实际上为了让面保持朝向用户但有立体感，我们需要在目标面确定后，轻微偏移相机视角
    // 这里采用：base + tilt 的顺序，即先转面再微调
    
    resultDice.style.transform = `${baseTransform} rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
}

// 刷新玩家战绩（支持打字机效果）
async function refreshPlayerStats(useTypewriter = false) {
    if (!currentAccount || !diceGameContract) return;

    try {
        const stats = await diceGameContract.methods.getPlayerStats(currentAccount).call();
        
        // 打字机效果更新数据
        if (useTypewriter) {
            typewriterEffect(totalGames, stats.totalGames);
            typewriterEffect(winGames, stats.winGames);
            typewriterEffect(winRate, (stats.winRate / 10) + '%');
            typewriterEffect(totalBet, stats.totalBet);
            typewriterEffect(totalWin, stats.totalWin);
        } else {
            totalGames.textContent = stats.totalGames;
            winGames.textContent = stats.winGames;
            winRate.textContent = (stats.winRate / 10) + '%';
            totalBet.textContent = stats.totalBet;
            totalWin.textContent = stats.totalWin;
        }
    } catch (error) {
        console.error('刷新战绩失败:', error);
    }
}

// 加载游戏记录（带打字机效果）
async function loadGameRecords() {
    if (!currentAccount || !diceGameContract) return;

    const page = parseInt(pageNumInput.value);
    const pageSize = parseInt(pageSizeInput.value);

    try {
        recordsList.innerHTML = '<div class="terminal-text">加载中...</div>';
        const result = await diceGameContract.methods.getPlayerGameRecords(currentAccount, page, pageSize).call();
        const { gameIds, records } = result;

        if (records.length === 0) {
            recordsList.innerHTML = '<div class="terminal-text">暂无游戏记录</div>';
            return;
        }

        let html = '';
        records.forEach((record, index) => {
            const amount = record.betAmount;
            const payout = record.result === '0' ? (record.payout || '0') : '0';
            const betType = record.betType === '0' ? '小' : '大';
            let resultText, resultClass;
            if (record.result === '0') {
                resultText = '胜利';
                resultClass = 'success';
            } else if (record.result === '1') {
                resultText = '失败';
                resultClass = 'failure';
            } else {
                resultText = '退款';
                resultClass = 'refund';
            }
            const time = new Date(record.timestamp * 1000).toLocaleString();

            html += `
                <div class="record-item">
                    <p>游戏ID: <span class="terminal-text">${gameIds[index]}</span></p>
                    <p>时间: <span class="terminal-text">${time}</span></p>
                    <p>投注金额: <span class="terminal-text">${amount} wei</span></p>
                    <p>猜: <span class="terminal-text">${betType}</span></p>
                    <p>骰子点数: <span class="terminal-text">${record.diceNumber}</span></p>
                    <p>结果: <span class="${resultClass} terminal-text">${resultText}</span></p>
                    <p>奖励: <span class="terminal-text">${payout} wei</span></p>
                </div>
            `;
        });
        
        // 逐行加载记录（打字机效果）
        recordsList.innerHTML = '';
        const recordItems = html.split('</div>');
        let index = 0;
        const addRecord = () => {
            if (index < recordItems.length - 1) {
                recordsList.innerHTML += recordItems[index] + '</div>';
                index++;
                setTimeout(addRecord, 100);
            }
        };
        addRecord();
    } catch (error) {
        console.error('加载记录失败:', error);
        recordsList.innerHTML = `<div class="failure terminal-text">加载失败: ${error.message}</div>`;
    }
}

// 加载排行榜
async function loadRanking() {
    if (!diceGameContract) return;

    try {
        rankingList.innerHTML = '<div class="terminal-text">加载中...</div>';
        const result = await diceGameContract.methods.getWinRateRanking(10).call();
        // Web3.js 返回的对象可能不可迭代，需要手动获取属性
        const players = result[0];
        const rates = result[1];

        if (players.length === 0) {
            rankingList.innerHTML = '<div class="terminal-text">暂无排名数据</div>';
            return;
        }

        let html = '';
        players.forEach((player, index) => {
            const rate = (rates[index] / 10) + '%';
            html += `
                <div class="ranking-item">
                    <p>排名: <span class="terminal-text">${index + 1}</span></p>
                    <p>地址: <span class="terminal-text">${player.substring(0, 6)}...${player.substring(38)}</span></p>
                    <p>胜率: <span class="terminal-text">${rate}</span></p>
                </div>
            `;
        });
        
        // 逐行加载排行榜
        rankingList.innerHTML = '';
        const rankingItems = html.split('</div>');
        let index = 0;
        const addRanking = () => {
            if (index < rankingItems.length - 1) {
                rankingList.innerHTML += rankingItems[index] + '</div>';
                index++;
                setTimeout(addRanking, 100);
            }
        };
        addRanking();
    } catch (error) {
        console.error('加载排行榜失败:', error);
        rankingList.innerHTML = `<div class="failure terminal-text">加载失败: ${error.message}</div>`;
    }
}

// 打字机效果函数
function typewriterEffect(element, text) {
    element.textContent = '';
    let index = 0;
    const type = () => {
        if (index < text.toString().length) {
            element.textContent += text.toString().charAt(index);
            index++;
            setTimeout(type, 50);
        }
    };
    type();
}

// 赛博朋克烟花动画
function launchFireworks() {
    fireworksCanvas.style.display = 'block';
    fireworksCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
    
    // 粒子数量
    const particleCount = 150;
    const particles = [];

    // 创建粒子
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: fireworksCanvas.width / 2,
            y: fireworksCanvas.height / 2,
            size: Math.random() * 3 + 1,
            speed: Math.random() * 5 + 2,
            angle: Math.random() * Math.PI * 2,
            color: ['#00ffea', '#ff00ff', '#ffff00', '#00ff00'][Math.floor(Math.random() * 4)],
            alpha: 1,
            decay: Math.random() * 0.01 + 0.005
        });
    }

    // 绘制粒子
    function drawParticles() {
        fireworksCtx.clearRect(0, 0, fireworksCanvas.width, fireworksCanvas.height);
        particles.forEach((p, i) => {
            // 更新粒子位置
            p.x += Math.cos(p.angle) * p.speed;
            p.y += Math.sin(p.angle) * p.speed;
            // 衰减透明度
            p.alpha -= p.decay;
            // 故障效果：随机偏移
            const glitchX = Math.random() * 3 - 1.5;
            const glitchY = Math.random() * 3 - 1.5;

            // 绘制粒子
            fireworksCtx.beginPath();
            fireworksCtx.fillStyle = p.color;
            fireworksCtx.globalAlpha = p.alpha;
            fireworksCtx.rect(p.x + glitchX, p.y + glitchY, p.size, p.size);
            fireworksCtx.fill();

            // 移除透明粒子
            if (p.alpha <= 0) {
                particles.splice(i, 1);
            }
        });

        // 循环绘制直到粒子消失
        if (particles.length > 0) {
            requestAnimationFrame(drawParticles);
        } else {
            fireworksCanvas.style.display = 'none';
        }
    }

    drawParticles();
}

// 金币雨动画
function launchCoinRain() {
    const coinCount = 50;
    const container = document.body;
    
    for (let i = 0; i < coinCount; i++) {
        setTimeout(() => {
            const coin = document.createElement('div');
            coin.classList.add('cyber-coin');
            
            // 随机起始位置
            const startX = Math.random() * window.innerWidth;
            coin.style.left = `${startX}px`;
            coin.style.top = '-50px';
            
            // 随机大小
            const scale = Math.random() * 0.5 + 0.8;
            coin.style.transform = `scale(${scale})`;
            
            container.appendChild(coin);
            
            // 物理运动
            let posY = -50;
            let speed = Math.random() * 5 + 3;
            let rotation = 0;
            let rotSpeed = Math.random() * 10 + 5;
            
            function animateCoin() {
                posY += speed;
                speed += 0.1; // 重力加速度
                rotation += rotSpeed;
                
                coin.style.transform = `translateY(${posY}px) rotateY(${rotation}deg) scale(${scale})`;
                // coin.style.top = `${posY}px`; // 不要混用 transform 和 top，这里主要为了垂直位移
                // 修正：上面的 transform 会覆盖 scale，需要组合
                // 直接修改 top 性能较差，推荐 transform play
                // 让我们简单点，用 top 做位移，transform 做旋转
                coin.style.top = `${posY}px`;
                coin.style.transform = `rotateY(${rotation}deg) scale(${scale})`;

                if (posY < window.innerHeight) {
                    requestAnimationFrame(animateCoin);
                } else {
                    coin.remove();
                }
            }
            
            requestAnimationFrame(animateCoin);
        }, i * 100); // 错开生成时间
    }
}

// 显示胜利/失败覆盖层动画
function showOverlayAnimation(type, text) {
    gameOverlay.classList.add('active');
    overlayContent.innerHTML = `<div class="${type === 'win' ? 'win-text' : 'lose-text'}">${text}</div>`;
    
    // 3秒后自动关闭
    setTimeout(() => {
        gameOverlay.classList.remove('active');
        // 稍微延迟清空内容
        setTimeout(() => {
            overlayContent.innerHTML = '';
        }, 300);
    }, 3000);
}

// 失败屏幕震动效果
function shakeScreen() {
    document.body.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
    setTimeout(() => {
        document.body.style.animation = '';
    }, 500);
}

// 注入震动 CSS
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes shake {
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
}
`;
document.head.appendChild(styleSheet);
