const winston = require('winston');
const path = require('path');
const fs = require('fs').promises;

// 确保日志目录存在
const ensureLogDir = async () => {
    const logDir = path.join(__dirname, '../../logs');
    try {
        await fs.mkdir(logDir, { recursive: true });
        return logDir;
    } catch (error) {
        console.error('创建日志目录失败:', error);
        return './logs';
    }
};

// 创建日志格式
const logFormat = winston.format.combine(
    winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// 控制台输出格式
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({
        format: 'HH:mm:ss.SSS'
    }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = '';
        if (Object.keys(meta).length > 0) {
            metaStr = ' ' + JSON.stringify(meta);
        }
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
);

// 创建日志记录器
const createLogger = async () => {
    const logDir = await ensureLogDir();
    const currentDate = new Date().toISOString().split('T')[0];
    
    return winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: logFormat,
        defaultMeta: { service: 'needlebot-ai' },
        transports: [
            // 控制台输出
            new winston.transports.Console({
                format: consoleFormat,
                level: 'debug'
            }),
            
            // 错误日志文件
            new winston.transports.File({
                filename: path.join(logDir, `error-${currentDate}.log`),
                level: 'error',
                maxsize: 5242880, // 5MB
                maxFiles: 10
            }),
            
            // 所有日志文件
            new winston.transports.File({
                filename: path.join(logDir, `combined-${currentDate}.log`),
                maxsize: 5242880, // 5MB
                maxFiles: 10
            }),
            
            // 交易日志文件
            new winston.transports.File({
                filename: path.join(logDir, `trades-${currentDate}.log`),
                level: 'info',
                maxsize: 5242880,
                maxFiles: 10,
                format: winston.format.combine(
                    winston.format.timestamp(),
                    winston.format.json()
                )
            })
        ],
        exceptionHandlers: [
            new winston.transports.File({
                filename: path.join(logDir, `exceptions-${currentDate}.log`)
            })
        ],
        rejectionHandlers: [
            new winston.transports.File({
                filename: path.join(logDir, `rejections-${currentDate}.log`)
            })
        ]
    });
};

// 创建单例日志记录器
let loggerInstance = null;

const getLogger = async () => {
    if (!loggerInstance) {
        loggerInstance = await createLogger();
    }
    return loggerInstance;
};

// 便捷方法
const logger = {
    info: async (message, meta) => {
        const log = await getLogger();
        log.info(message, meta);
    },
    
    error: async (message, meta) => {
        const log = await getLogger();
        log.error(message, meta);
    },
    
    warn: async (message, meta) => {
        const log = await getLogger();
        log.warn(message, meta);
    },
    
    debug: async (message, meta) => {
        const log = await getLogger();
        log.debug(message, meta);
    },
    
    trade: async (tradeData) => {
        const log = await getLogger();
        log.info('TRADE_EXECUTED', tradeData);
    },
    
    signal: async (signalData) => {
        const log = await getLogger();
        log.info('SIGNAL_DETECTED', signalData);
    },
    
    risk: async (riskData) => {
        const log = await getLogger();
        log.warn('RISK_ASSESSMENT', riskData);
    }
};

module.exports = logger;