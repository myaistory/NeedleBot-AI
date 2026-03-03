/**
 * Jupiter API 错误处理器
 * 
 * 提供完善的错误处理机制，包括：
 * - 错误分类和识别
 * - 重试策略
 * - 断路器模式
 * - 监控和报警
 * - 优雅降级
 */

class JupiterErrorHandler {
    constructor(config = {}) {
        // 错误配置
        this.config = {
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
            circuitBreakerResetTimeout: config.circuitBreakerResetTimeout || 60000, // 60秒
            ...config
        };

        // 错误统计
        this.errorStats = {
            totalErrors: 0,
            byType: {},
            byEndpoint: {},
            lastErrorTime: null,
            consecutiveErrors: 0
        };

        // 断路器状态
        this.circuitBreaker = {
            isOpen: false,
            failureCount: 0,
            lastFailureTime: null,
            nextAttemptTime: null
        };

        // 重试策略
        this.retryStrategies = {
            network: { maxRetries: 3, backoff: 'exponential' },
            rateLimit: { maxRetries: 2, backoff: 'exponential' },
            serverError: { maxRetries: 3, backoff: 'linear' },
            validation: { maxRetries: 0, backoff: 'none' }, // 验证错误不重试
            timeout: { maxRetries: 2, backoff: 'exponential' }
        };
    }

    /**
     * 错误分类
     */
    classifyError(error, context = {}) {
        const errorType = {
            network: this._isNetworkError(error),
            rateLimit: this._isRateLimitError(error),
            serverError: this._isServerError(error),
            validation: this._isValidationError(error),
            timeout: this._isTimeoutError(error),
            authentication: this._isAuthenticationError(error)
        };

        const type = Object.keys(errorType).find(key => errorType[key]) || 'unknown';
        
        return {
            type,
            message: error.message,
            code: error.code || error.response?.status,
            context,
            timestamp: new Date().toISOString(),
            shouldRetry: this._shouldRetry(type),
            retryStrategy: this.retryStrategies[type] || this.retryStrategies.unknown
        };
    }

    /**
     * 处理错误（带重试）
     */
    async handleWithRetry(operation, context = {}) {
        // 检查断路器
        if (this.circuitBreaker.isOpen) {
            const now = Date.now();
            if (now < this.circuitBreaker.nextAttemptTime) {
                throw new Error(`断路器已打开，请等待 ${Math.ceil((this.circuitBreaker.nextAttemptTime - now) / 1000)} 秒后重试`);
            }
            // 尝试重置断路器
            this.circuitBreaker.isOpen = false;
        }

        let lastError;
        let attempt = 0;
        const maxAttempts = this.config.maxRetries + 1; // 初始尝试 + 重试次数

        while (attempt < maxAttempts) {
            attempt++;
            
            try {
                const result = await operation();
                
                // 成功：重置错误计数
                this._recordSuccess();
                return result;
                
            } catch (error) {
                lastError = error;
                
                // 分类错误
                const errorInfo = this.classifyError(error, { ...context, attempt });
                
                // 记录错误
                this._recordError(errorInfo);
                
                // 更新断路器
                this._updateCircuitBreaker(errorInfo);
                
                // 检查是否应该重试
                if (!errorInfo.shouldRetry || attempt >= maxAttempts) {
                    break;
                }
                
                // 计算重试延迟
                const delay = this._calculateRetryDelay(errorInfo.type, attempt);
                console.log(`⚠️  ${errorInfo.type} 错误，${delay}ms 后重试 (${attempt}/${maxAttempts-1})`);
                
                // 等待重试
                await this._sleep(delay);
            }
        }

        // 所有重试都失败
        throw this._createFinalError(lastError, attempt, context);
    }

    /**
     * 断路器模式
     */
    _updateCircuitBreaker(errorInfo) {
        this.circuitBreaker.failureCount++;
        
        if (this.circuitBreaker.failureCount >= this.config.circuitBreakerThreshold) {
            this.circuitBreaker.isOpen = true;
            this.circuitBreaker.lastFailureTime = Date.now();
            this.circuitBreaker.nextAttemptTime = Date.now() + this.config.circuitBreakerResetTimeout;
            
            console.warn(`🚨 断路器已打开！失败次数: ${this.circuitBreaker.failureCount}`);
            console.warn(`    将在 ${this.config.circuitBreakerResetTimeout / 1000} 秒后重置`);
        }
    }

    /**
     * 重置断路器
     */
    resetCircuitBreaker() {
        this.circuitBreaker = {
            isOpen: false,
            failureCount: 0,
            lastFailureTime: null,
            nextAttemptTime: null
        };
        console.log('✅ 断路器已重置');
    }

    /**
     * 错误类型检测
     */
    _isNetworkError(error) {
        return error.code === 'ECONNREFUSED' || 
               error.code === 'ENOTFOUND' ||
               error.message.includes('network') ||
               error.message.includes('connection');
    }

    _isRateLimitError(error) {
        return error.response?.status === 429 ||
               error.message.includes('rate limit') ||
               error.message.includes('too many requests');
    }

    _isServerError(error) {
        const status = error.response?.status;
        return status >= 500 && status < 600;
    }

    _isValidationError(error) {
        const status = error.response?.status;
        return status === 400 || status === 422 || 
               error.message.includes('validation') ||
               error.message.includes('invalid');
    }

    _isTimeoutError(error) {
        return error.code === 'ETIMEDOUT' ||
               error.message.includes('timeout') ||
               error.message.includes('timed out');
    }

    _isAuthenticationError(error) {
        return error.response?.status === 401 || 
               error.response?.status === 403 ||
               error.message.includes('authentication') ||
               error.message.includes('unauthorized');
    }

    /**
     * 重试策略
     */
    _shouldRetry(errorType) {
        const strategy = this.retryStrategies[errorType];
        return strategy && strategy.maxRetries > 0;
    }

    _calculateRetryDelay(errorType, attempt) {
        const strategy = this.retryStrategies[errorType] || this.retryStrategies.unknown;
        
        switch (strategy.backoff) {
            case 'exponential':
                return this.config.retryDelay * Math.pow(2, attempt - 1);
            case 'linear':
                return this.config.retryDelay * attempt;
            case 'fixed':
                return this.config.retryDelay;
            default:
                return this.config.retryDelay;
        }
    }

    /**
     * 记录和统计
     */
    _recordError(errorInfo) {
        this.errorStats.totalErrors++;
        this.errorStats.lastErrorTime = new Date().toISOString();
        this.errorStats.consecutiveErrors++;
        
        // 按类型统计
        this.errorStats.byType[errorInfo.type] = (this.errorStats.byType[errorInfo.type] || 0) + 1;
        
        // 按端点统计
        if (errorInfo.context.endpoint) {
            this.errorStats.byEndpoint[errorInfo.context.endpoint] = 
                (this.errorStats.byEndpoint[errorInfo.context.endpoint] || 0) + 1;
        }
        
        // 记录详细错误
        console.error(`❌ ${errorInfo.type.toUpperCase()} 错误:`, {
            message: errorInfo.message,
            code: errorInfo.code,
            endpoint: errorInfo.context.endpoint,
            attempt: errorInfo.context.attempt
        });
    }

    _recordSuccess() {
        this.errorStats.consecutiveErrors = 0;
        
        // 如果连续成功，减少断路器失败计数
        if (this.circuitBreaker.failureCount > 0) {
            this.circuitBreaker.failureCount = Math.max(0, this.circuitBreaker.failureCount - 1);
        }
    }

    /**
     * 创建最终错误
     */
    _createFinalError(originalError, attempts, context) {
        const errorInfo = this.classifyError(originalError, context);
        
        const finalError = new Error(
            `操作失败，已重试 ${attempts - 1} 次: ${errorInfo.message}`
        );
        
        finalError.originalError = originalError;
        finalError.errorInfo = errorInfo;
        finalError.attempts = attempts;
        finalError.context = context;
        finalError.timestamp = new Date().toISOString();
        
        // 添加统计信息
        finalError.stats = {
            totalErrors: this.errorStats.totalErrors,
            consecutiveErrors: this.errorStats.consecutiveErrors,
            circuitBreakerStatus: this.circuitBreaker
        };
        
        return finalError;
    }

    /**
     * 获取错误统计
     */
    getErrorStats() {
        return {
            ...this.errorStats,
            circuitBreaker: this.circuitBreaker,
            errorRate: this._calculateErrorRate()
        };
    }

    _calculateErrorRate() {
        // 这里可以添加更复杂的错误率计算逻辑
        return this.errorStats.totalErrors > 0 ? 
            (this.errorStats.consecutiveErrors / this.errorStats.totalErrors) * 100 : 0;
    }

    /**
     * 工具函数
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 验证和修复数据
     */
    validateAndFixQuoteData(quoteData) {
        const fixes = [];
        
        // 确保inAmount是字符串
        if (quoteData.inAmount !== undefined && typeof quoteData.inAmount !== 'string') {
            quoteData.inAmount = quoteData.inAmount.toString();
            fixes.push('inAmount转换为字符串');
        }
        
        // 确保outAmount是字符串
        if (quoteData.outAmount !== undefined && typeof quoteData.outAmount !== 'string') {
            quoteData.outAmount = quoteData.outAmount.toString();
            fixes.push('outAmount转换为字符串');
        }
        
        // 确保其他数值字段是字符串
        const numericFields = ['slippageBps', 'priceImpactPct', 'otherAmountThreshold'];
        numericFields.forEach(field => {
            if (quoteData[field] !== undefined && typeof quoteData[field] !== 'string') {
                quoteData[field] = quoteData[field].toString();
                fixes.push(`${field}转换为字符串`);
            }
        });
        
        if (fixes.length > 0) {
            console.log(`🔧 自动修复数据: ${fixes.join(', ')}`);
        }
        
        return quoteData;
    }

    /**
     * 创建优雅降级响应
     */
    createFallbackResponse(errorInfo, context) {
        const fallbacks = {
            network: () => ({
                success: false,
                error: '网络连接失败',
                fallback: '使用缓存数据或返回默认值',
                timestamp: new Date().toISOString()
            }),
            rateLimit: () => ({
                success: false,
                error: 'API速率限制',
                fallback: '等待后重试或使用备用API',
                retryAfter: 60, // 60秒后重试
                timestamp: new Date().toISOString()
            }),
            serverError: () => ({
                success: false,
                error: '服务器错误',
                fallback: '使用备用服务或返回模拟数据',
                timestamp: new Date().toISOString()
            }),
            default: () => ({
                success: false,
                error: '服务暂时不可用',
                fallback: '请稍后重试',
                timestamp: new Date().toISOString()
            })
        };
        
        const fallback = fallbacks[errorInfo.type] || fallbacks.default;
        return fallback();
    }
}

module.exports = JupiterErrorHandler;