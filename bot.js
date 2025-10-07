// bots.js - Optimized Version
const mineflayer = require('mineflayer');
const express = require('express');
const dns = require('dns').promises;

// ==================== Configuration ====================
const CONFIG = {
  server: {
    port: process.env.PORT || 3000
  },
  bot: {
    commandCooldownMs: 3000,
    maxCommandLength: 200,
    loginTimeoutMs: 20000,
    reconnectBaseDelayMs: 5000,
    reconnectMaxDelayMs: 60000,
    reconnectJitterMs: 2000,
    botStartStaggerMs: 9000,
    maxListeners: 30,
    // Thêm config để xử lý ECONNRESET
    chatDelay: 100, // delay giữa các chat messages
    maxChatQueue: 10, // giới hạn queue chat
    keepAliveInterval: 30000 // ping server mỗi 30s
  },
  security: {
    allowedCommands: [
      '/tp', '/msg', '/say', '/warp', '/home', 
      '/spawn', '/tpa', '/tpaccept', '/tpdeny', '/me'
    ]
  }
};

const BOTS_CONFIG = [
  { host: 'tuban.fun', fallbackIp: '163.61.111.11', port: 25643, username: 'chariuanh', password: '13579', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem', autoActivateItem: true },
  { host: 'tuban.fun', fallbackIp: '163.61.111.11', port: 25643, username: 'chariuanh1', password: '13579', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' },
  { host: 'tuban.fun', fallbackIp: '163.61.111.11', port: 25643, username: 'chariuanh2', password: '13579', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' },
  { host: 'tuban.fun', fallbackIp: '163.61.111.11', port: 25643, username: 'chariuanh3', password: '13579', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' },
  { host: 'tuban.fun', fallbackIp: '163.61.111.11', port: 25643, username: 'chariuanh4', password: '13579', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' },
  { host: 'tuban.fun', fallbackIp: '163.61.111.11', port: 25643, username: 'chariuanh5', password: '13579', version: '1.21.7', allowedSender: 'chariuem', adminUser: 'chariuem' }
];

// ==================== Utility Functions ====================
class CooldownManager {
  constructor() {
    this.cooldowns = new Map();
  }

  isOnCooldown(key, cooldownMs) {
    const lastTime = this.cooldowns.get(key) || 0;
    return Date.now() - lastTime < cooldownMs;
  }

  setCooldown(key) {
    this.cooldowns.set(key, Date.now());
  }

  clear(key) {
    this.cooldowns.delete(key);
  }

  // Cleanup old entries to prevent memory leak
  cleanup(maxAgeMs = 300000) { // 5 minutes default
    const now = Date.now();
    for (const [key, time] of this.cooldowns.entries()) {
      if (now - time > maxAgeMs) {
        this.cooldowns.delete(key);
      }
    }
  }
}

class Logger {
  static colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    // Foreground colors
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
  };

  static getLevelColor(level) {
    const colors = {
      'INFO': this.colors.green,
      'WARN': this.colors.yellow,
      'ERROR': this.colors.red,
      'DEBUG': this.colors.cyan
    };
    return colors[level] || this.colors.white;
  }

  static log(botName, message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const levelColor = this.getLevelColor(level);
    const reset = this.colors.reset;
    const gray = this.colors.gray;
    
    // Center align bot name trong ngoặc vuông (12 chars width)
    const maxBotNameLength = 12;
    const padding = Math.max(0, maxBotNameLength - botName.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    const centeredBotName = ' '.repeat(leftPad) + botName + ' '.repeat(rightPad);
    
    console.log(
      `${gray}[${timestamp}]${reset} ` +
      `${levelColor}[${level.padEnd(5)}]${reset} ` +
      `[${centeredBotName}] ` +
      `${message}`
    );
  }

  static error(botName, message, error) {
    this.log(botName, `${message}: ${error?.message || error}`, 'ERROR');
    if (error?.stack) {
      console.error(`${this.colors.red}${error.stack}${this.colors.reset}`);
    }
  }

  static warn(botName, message) {
    this.log(botName, message, 'WARN');
  }

  static debug(botName, message) {
    if (process.env.DEBUG === 'true') {
      this.log(botName, message, 'DEBUG');
    }
  }
}

function sanitizeCommand(cmd) {
  if (typeof cmd !== 'string') return '';
  return cmd
    .replace(/\r?\n/g, ' ')
    .trim()
    .slice(0, CONFIG.bot.maxCommandLength);
}

async function resolveHost(host, fallbackIp) {
  try {
    // If already IP address, return it
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return host;
    }
    
    const addresses = await dns.resolve4(host);
    return addresses[0];
  } catch (error) {
    Logger.warn('DNS', `Failed to resolve ${host}, using fallback: ${fallbackIp}`);
    return fallbackIp || host;
  }
}

function calculateBackoffDelay(attempt) {
  const base = CONFIG.bot.reconnectBaseDelayMs;
  const jitter = Math.floor(Math.random() * CONFIG.bot.reconnectJitterMs);
  const delay = Math.min(
    base * Math.pow(1.5, attempt),
    CONFIG.bot.reconnectMaxDelayMs
  );
  return delay + jitter;
}

// ==================== Message Parser ====================
class MessageParser {
  static parseWhisper(message) {
    // Format: [sender -> receiver] command
    const regex = /^\[(.+?)\s*->\s*(.+?)\]\s*(.+)$/;
    const match = message.match(regex);
    
    if (!match) return null;
    
    return {
      sender: match[1].trim(),
      receiver: match[2].trim(),
      command: match[3].trim()
    };
  }

  static isCommand(text) {
    return text.startsWith('/');
  }

  static getCommandBase(command) {
    return command.split(' ')[0].toLowerCase();
  }
}

// ==================== Chat Queue Manager ====================
class ChatQueue {
  constructor(bot, botName) {
    this.bot = bot;
    this.botName = botName;
    this.queue = [];
    this.processing = false;
    this.lastSentTime = 0;
  }

  async add(message) {
    if (this.queue.length >= CONFIG.bot.maxChatQueue) {
      Logger.warn(this.botName, `Chat queue full, dropping message: ${message}`);
      return;
    }

    this.queue.push(message);
    
    if (!this.processing) {
      this.process();
    }
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;

    while (this.queue.length > 0) {
      const message = this.queue.shift();
      
      try {
        // Rate limiting: đảm bảo delay giữa các message
        const now = Date.now();
        const timeSinceLastSent = now - this.lastSentTime;
        
        if (timeSinceLastSent < CONFIG.bot.chatDelay) {
          await this.delay(CONFIG.bot.chatDelay - timeSinceLastSent);
        }

        // Kiểm tra bot còn connected không
        if (!this.bot || !this.bot._client || !this.bot._client.socket) {
          Logger.warn(this.botName, 'Bot disconnected, clearing chat queue');
          this.queue = [];
          break;
        }

        // Kiểm tra socket có writable không
        if (!this.bot._client.socket.writable) {
          Logger.warn(this.botName, 'Socket not writable, queueing message');
          this.queue.unshift(message); // Put back to queue
          await this.delay(1000);
          continue;
        }

        this.bot.chat(message);
        this.lastSentTime = Date.now();
        
      } catch (error) {
        Logger.error(this.botName, 'Error sending chat message', error);
        
        // Nếu là ECONNRESET, dừng xử lý queue
        if (error.code === 'ECONNRESET' || error.code === 'EPIPE') {
          Logger.warn(this.botName, 'Connection lost, clearing remaining queue');
          this.queue = [];
          break;
        }
      }
    }

    this.processing = false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clear() {
    this.queue = [];
    this.processing = false;
  }
}

// ==================== Bot Manager ====================
class MinecraftBot {
  constructor(config) {
    this.config = config;
    this.botName = config.username;
    this.bot = null;
    this.attempts = 0;
    this.stopped = false;
    this.loginTimer = null;
    this.keepAliveTimer = null;
    this.cooldownManager = new CooldownManager();
    this.chatQueue = null;
    this.isConnected = false;
    
    // Start cleanup interval for cooldowns
    this.cleanupInterval = setInterval(
      () => this.cooldownManager.cleanup(),
      60000 // Every minute
    );
  }

  async connect() {
    if (this.stopped) return;

    this.attempts++;
    const host = await resolveHost(this.config.host, this.config.fallbackIp);
    
    Logger.log(this.botName, `Connecting to ${host}:${this.config.port} (attempt #${this.attempts})`);

    try {
      this.bot = mineflayer.createBot({
        host,
        port: this.config.port,
        username: this.config.username,
        version: this.config.version,
        checkTimeoutInterval: 60000, // Tăng lên 60s để tránh timeout khi server lag
        hideErrors: false
      });

      this.bot.setMaxListeners(CONFIG.bot.maxListeners);
      this.chatQueue = new ChatQueue(this.bot, this.botName);
      this.setupEventHandlers();
      this.setupLoginTimeout();
    } catch (error) {
      Logger.error(this.botName, 'Failed to create bot', error);
      this.scheduleReconnect();
    }
  }

  setupLoginTimeout() {
    this.loginTimer = setTimeout(() => {
      Logger.log(this.botName, 'Login timeout, destroying connection', 'WARN');
      this.destroyBot();
    }, CONFIG.bot.loginTimeoutMs);
  }

  setupEventHandlers() {
    this.bot.once('login', () => this.onLogin());
    this.bot.on('spawn', () => this.onSpawn());
    this.bot.on('messagestr', (msg) => this.onMessage(msg));
    this.bot.on('kicked', (reason) => this.onKicked(reason));
    this.bot.on('error', (err) => this.onError(err));
    this.bot.on('end', () => this.onEnd());
    
    // Xử lý packet errors - QUAN TRỌNG cho 1.21.7
    this.bot._client.on('error', (err) => {
      const msg = err.message || '';
      
      // Bỏ qua các packet parsing errors không quan trọng
      if (msg.includes('PartialReadError')) {
        Logger.debug(this.botName, 'Ignored PartialReadError (protocol parsing issue)');
        return;
      }
      
      if (msg.includes('Chunk size') || msg.includes('partial packet')) {
        Logger.debug(this.botName, 'Ignored packet parsing error');
        return;
      }
      
      // Log các errors khác
      this.onError(err);
    });
  }

  onLogin() {
    clearTimeout(this.loginTimer);
    this.attempts = 0;
    this.isConnected = true;
    Logger.log(this.botName, 'Successfully logged in');
    
    // Setup keep-alive để duy trì connection
    this.setupKeepAlive();
  }

  setupKeepAlive() {
    // Clear existing timer nếu có
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }

    // Ping server định kỳ để giữ connection
    this.keepAliveTimer = setInterval(() => {
      try {
        if (this.bot && this.bot._client && this.bot._client.socket) {
          // Check if socket is still writable
          if (this.bot._client.socket.writable) {
            // Send a harmless packet để keep connection alive
            // Minecraft client tự động gửi keep-alive packets
            Logger.debug(this.botName, 'Keep-alive check: OK');
          } else {
            Logger.warn(this.botName, 'Socket not writable, may disconnect soon');
          }
        }
      } catch (error) {
        Logger.error(this.botName, 'Keep-alive error', error);
      }
    }, CONFIG.bot.keepAliveInterval);
  }

  onSpawn() {
    Logger.log(this.botName, 'Spawned in world');
    
    if (this.config.autoActivateItem) {
      try {
        this.bot.activateItem();
      } catch (error) {
        Logger.error(this.botName, 'Failed to activate item', error);
      }
    }
  }

  onMessage(message) {
    try {
      const msg = String(message);
      const msgLower = msg.toLowerCase();

      // Auto authentication - sử dụng queue
      if (msgLower.includes('/login')) {
        this.chatQueue.add(`/login ${this.config.password}`);
        Logger.log(this.botName, 'Auto-login triggered');
        return;
      }

      if (msgLower.includes('/register')) {
        this.chatQueue.add(`/register ${this.config.password} ${this.config.password}`);
        Logger.log(this.botName, 'Auto-register triggered');
        return;
      }

      // Parse whisper command
      const parsed = MessageParser.parseWhisper(msg);
      if (!parsed) return;

      this.handleCommand(parsed);
    } catch (error) {
      Logger.error(this.botName, 'Message handler error', error);
    }
  }

  handleCommand({ sender, command: rawCommand }) {
    const command = sanitizeCommand(rawCommand);
    const cooldownKey = `${this.botName}:${sender}`;

    // Check cooldown
    if (this.cooldownManager.isOnCooldown(cooldownKey, CONFIG.bot.commandCooldownMs)) {
      Logger.log(this.botName, `Command from ${sender} ignored (cooldown)`);
      return;
    }

    this.cooldownManager.setCooldown(cooldownKey);

    // Handle admin commands
    if (this.isAdmin(sender)) {
      if (this.handleAdminCommand(sender, command)) {
        return;
      }
    }

    // Check permissions
    if (!this.hasPermission(sender)) {
      this.bot.chat(`/msg ${sender} Bạn không có quyền!`);
      Logger.log(this.botName, `Permission denied for ${sender}: ${command}`);
      return;
    }

    // Validate and execute command
    if (MessageParser.isCommand(command)) {
      this.executeCommand(sender, command);
    } else {
      this.sendChat(sender, command);
    }
  }

  isAdmin(sender) {
    return sender.toLowerCase() === this.config.adminUser.toLowerCase();
  }

  hasPermission(sender) {
    return this.config.allowedSender === '*' || 
           sender.toLowerCase() === this.config.allowedSender.toLowerCase();
  }

  handleAdminCommand(sender, command) {
    const cmdLower = command.toLowerCase();

    if (cmdLower === '/all') {
      this.config.allowedSender = '*';
      this.chatQueue.add(`/msg ${sender} Bot mở cho tất cả`);
      Logger.log(this.botName, `Admin ${sender} enabled public access`);
      return true;
    }

    if (cmdLower === '/me') {
      this.config.allowedSender = this.config.adminUser;
      this.chatQueue.add(`/msg ${sender} Bot chỉ cho admin`);
      Logger.log(this.botName, `Admin ${sender} restricted to admin only`);
      return true;
    }

    return false;
  }

  executeCommand(sender, command) {
    const commandBase = MessageParser.getCommandBase(command);

    if (!CONFIG.security.allowedCommands.includes(commandBase)) {
      this.chatQueue.add(`/msg ${sender} Lệnh không được phép`);
      Logger.log(this.botName, `Blocked command ${commandBase} from ${sender}`);
      return;
    }

    this.chatQueue.add(command);
    Logger.log(this.botName, `Executed command from ${sender}: ${command}`);
  }

  sendChat(sender, message) {
    this.chatQueue.add(message);
    Logger.log(this.botName, `Sent chat from ${sender}: ${message}`);
  }

  onKicked(reason) {
    Logger.warn(this.botName, `Kicked: ${reason}`);
    this.isConnected = false;
  }

  onError(error) {
    const code = error?.code || error?.message || 'unknown';
    
    // Log ít verbose hơn cho các lỗi thường gặp
    if (code === 'ECONNRESET' || code === 'EPIPE') {
      Logger.warn(this.botName, `Connection error: ${code} (normal, will reconnect)`);
    } else if (typeof code === 'string' && code.includes('timed out')) {
      Logger.warn(this.botName, 'Connection timeout (server lag or network issue)');
    } else {
      Logger.error(this.botName, `Connection error (${code})`, error);
    }
    
    this.isConnected = false;
  }

  onEnd() {
    Logger.log(this.botName, 'Disconnected');
    this.isConnected = false;
    this.cleanup();
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.stopped) return;

    const delay = calculateBackoffDelay(this.attempts);
    Logger.log(this.botName, `Reconnecting in ${Math.round(delay / 1000)}s`);
    
    setTimeout(() => this.connect(), delay);
  }

  cleanup() {
    try {
      // Clear timers
      if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
      }

      // Clear chat queue
      if (this.chatQueue) {
        this.chatQueue.clear();
      }

      // Remove all listeners
      if (this.bot) {
        this.bot.removeAllListeners();
      }
    } catch (error) {
      Logger.error(this.botName, 'Cleanup error', error);
    }
  }

  destroyBot() {
    try {
      if (this.bot) {
        this.bot.quit();
      }
    } catch (error) {
      // Ignore errors when destroying - connection might already be dead
      Logger.debug(this.botName, 'Destroy error (can be ignored)');
    }
  }

  stop() {
    this.stopped = true;
    this.isConnected = false;
    clearInterval(this.cleanupInterval);
    clearTimeout(this.loginTimer);
    clearInterval(this.keepAliveTimer);
    this.destroyBot();
    Logger.log(this.botName, 'Bot stopped');
  }
}

// ==================== Bot Manager ====================
class BotManager {
  constructor(configs) {
    this.configs = configs;
    this.bots = [];
  }

  async startAll() {
    Logger.log('MANAGER', `Starting ${this.configs.length} bots with ${CONFIG.bot.botStartStaggerMs}ms stagger`);

    for (let i = 0; i < this.configs.length; i++) {
      await this.delay(i * CONFIG.bot.botStartStaggerMs);
      
      const botInstance = new MinecraftBot(this.configs[i]);
      this.bots.push(botInstance);
      botInstance.connect();
    }
  }

  stopAll() {
    Logger.log('MANAGER', 'Stopping all bots');
    this.bots.forEach(bot => bot.stop());
    this.bots = [];
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== Express Server ====================
function setupExpressServer() {
  const app = express();
  
  app.get('/', (req, res) => {
    res.json({
      status: 'online',
      bots: BOTS_CONFIG.length,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy',
      uptime: process.uptime()
    });
  });

  app.listen(CONFIG.server.port, () => {
    Logger.log('SERVER', `HTTP server listening on port ${CONFIG.server.port}`);
  });

  return app;
}

// ==================== Main ====================
function main() {
  setupExpressServer();
  
  const manager = new BotManager(BOTS_CONFIG);
  manager.startAll();

  // Graceful shutdown
  const shutdown = (signal) => {
    Logger.log('MAIN', `Received ${signal}, shutting down gracefully`);
    manager.stopAll();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    const msg = error.message || '';
    
    // Bỏ qua timeout errors - chúng đã được xử lý trong bot.on('error')
    if (msg.includes('timed out')) {
      Logger.warn('MAIN', 'Timeout error caught (already handled by bot)');
      return;
    }
    
    // Bỏ qua PartialReadError - không ảnh hưởng bot functionality
    if (msg.includes('PartialReadError') || error.name === 'PartialReadError') {
      Logger.debug('MAIN', 'PartialReadError caught (protocol parsing, can be ignored)');
      return;
    }
    
    Logger.error('MAIN', 'Uncaught exception', error);
    manager.stopAll();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    Logger.error('MAIN', 'Unhandled rejection', reason);
  });
}

// Start the application
main();