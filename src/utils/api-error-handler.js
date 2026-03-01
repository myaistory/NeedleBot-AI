/**
 * API错误处理模块
 * 提供完善的错误处理、重试机制和速率限制
 */

const logger = require('./logger');

class APIErrorHandler {
    constructor() {
        this.rateLimits = new Map();
        this.maxRetries = 3;
        this.retryDelays = [1000, 3000, 5000]; // 重试延迟（毫秒）
        this.circuitBreaker = {
            failures: 0,
            threshold: 5,
            resetTimeout: 60000, // 60秒后重置
            lastFailure: null,
            isOpen: false
        };
    }

    /**
     * 检查API速率限制
     */
    checkRateLimit(apiName, limitPerMinute = 60) {
        const now = Date.now();
        const key = apiName;
        
        if (!this.rateLimits.has(key)) {
            this.rateLimits.set(key, {
                count: 1,
                windowStart: now,
                limit: limitPerMinute
            });
            return true;
        }
        
        const limit = this.rateLimits.get(key);
        
        // 检查是否在同一分钟窗口内
        if (now - limit.windowStart < 60000) {
            if (limit.count >= limit.limit) {
                logger.warn(`API速率限制: ${apiName} (${limit.count}/${limit.limit})`);
                return false;
            }
            limit.count++;
        } else {
            // 新的一分钟，重置计数器
            limit.count = 1;
            limit.windowStart = now;
        }
        
        return true;
    }

    /**
     * 处理API错误并决定是否重试
     */
    async handleError(error, operation, retryCount = 0) {
        const errorInfo = {
            operation,
            error: error.message,
            code: error.code,
            status: error.response?.status,
            retryCount,
            timestamp: new Date().toISOString()
        };

        // 记录错误
        logger.error(`API错误 [${operation}]:`, errorInfo);

        // 检查是否需要更新断路器
        this.updateCircuitBreaker(error);

        // 如果是断路器打开状态，直接失败
        if (this.circuitBreaker.isOpen) {
            const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailure;
            if (timeSinceFailure < this.circuitBreaker.resetTimeout) {
                throw new Error(`断路器打开: ${operation}，请等待 ${Math.ceil((this.circuitBreaker.resetTimeout - timeSinceFailure) / 1000)} 秒`);
            } else {
                // 重置断路器
                this.resetCircuitBreaker();
            }
        }

        // 决定是否重试
        if (this.shouldRetry(error, retryCount)) {
            const delay = this.retryDelays[retryCount] || 5000;
            logger.info(`重试 ${operation} (${retryCount + 1}/${this.maxRetries})，等待 ${delay}ms`);
            
            await this.delay(delay);
            return true; // 应该重试
        }

        return false; // 不应该重试
    }

    /**
     * 更新断路器状态
     */
    updateCircuitBreaker(error) {
        // 只有特定错误才计入断路器
        const isServerError = error.response?.status >= 500;
        const isNetworkError = !error.response && error.code !== 'ECONNABORTED';
        
        if (isServerError || isNetworkError) {
            this.circuitBreaker.failures++;
            this.circuitBreaker.lastFailure = Date.now();
            
            if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
                this.circuitBreaker.isOpen = true;
                logger.warn(`断路器打开，连续失败 ${this.circuitBreaker.failures} 次`);
            }
        } else {
            // 客户端错误（4xx）不计入断路器
            this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
        }
    }

    /**
     * 重置断路器
     */
    resetCircuitBreaker() {
        this.circuitBreaker.failures = 0;
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.lastFailure = null;
        logger.info('断路器已重置');
    }

    /**
     * 判断是否应该重试
     */
    shouldRetry(error, retryCount) {
        if (retryCount >= this.maxRetries) {
            return false;
        }

        // 应该重试的错误类型
        const retryableErrors = [
            'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND',
            'EAI_AGAIN', 'EPIPE', 'EHOSTUNREACH'
        ];

        const isNetworkError = retryableErrors.includes(error.code);
        const isServerError = error.response?.status >= 500;
        const isRateLimit = error.response?.status === 429;
        const isTimeout = error.code === 'ECONNABORTED';

        return isNetworkError || isServerError || isRateLimit || isTimeout;
    }

    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 安全的API调用包装器
     */
    async callWithRetry(apiCall, operation, options = {}) {
        let lastError;
        
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                // 检查速率限制
                if (!this.checkRateLimit(operation, options.rateLimit)) {
                    await this.delay(1000); // 等待1秒
                    continue;
                }

                // 检查断路器
                if (this.circuitBreaker.isOpen) {
                    const timeSinceFailure = Date.now() - this.circuitBreaker.lastFailure;
                    if (timeSinceFailure < this.circuitBreaker.resetTimeout) {
                        throw new Error(`断路器打开，请等待 ${Math.ceil((this.circuitBreaker.resetTimeout - timeSinceFailure) / 1000)} 秒`);
                    } else {
                        this.resetCircuitBreaker();
                    }
                }

                const result = await apiCall();
                
                // 成功时重置失败计数
                if (attempt > 0) {
                    logger.info(`${operation} 在第 ${attempt + 1} 次尝试后成功`);
                }
                
                // 成功时减少断路器失败计数
                this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // 处理错误并决定是否重试
                const shouldRetry = await this.handleError(error, operation, attempt);
                
                if (!shouldRetry || attempt === this.maxRetries) {
                    break;
                }
            }
        }
        
        throw lastError || new Error(`${operation} 失败，达到最大重试次数`);
    }

    /**
     * 获取API状态报告
     */
    getStatus() {
        return {
            circuitBreaker: {
                isOpen: this.circuitBreaker.isOpen,
                failures: this.circuitBreaker.failures,
                threshold: this.circuitBreaker.threshold,
                lastFailure: this.circuitBreaker.lastFailure ? new Date(this.circuitBreaker.lastFailure).toISOString() : null
            },
            rateLimits: Array.from(this.rateLimits.entries()).map(([key, value]) => ({
                api: key,
                count: value.count,
                limit: value.limit,
                windowStart: new Date(value.windowStart).toISOString()
            })),
            stats: {
                maxRetries: this.maxRetries,
                retryDelays: this.retryDelays
            }
        };
    }

    /**
     * 重置所有限制
     */
    reset() {
        this.rateLimits.clear();
        this.resetCircuitBreaker();
        logger.info('API错误处理器已重置');
    }
}

// 创建单例实例
const apiErrorHandler = new APIErrorHandler();

module.exports = {
    APIErrorHandler,
    apiErrorHandler,
    
    // 便捷函数
    async callWithRetry(apiCall, operation, options = {}) {
        return apiErrorHandler.callWithRetry(apiCall, operation, options);
    },
    
    checkRateLimit(apiName, limitPerMinute = 60) {
        return apiErrorHandler.checkRateLimit(apiName, limitPerMinute);
    },
    
    getStatus() {
        return apiErrorHandler.getStatus();
    },
    
    reset() {
        return apiErrorHandler.reset();
    }
};