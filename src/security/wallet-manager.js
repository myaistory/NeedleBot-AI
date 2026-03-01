/**
 * 钱包安全管理器
 * 提供安全的私钥存储和交易签名功能
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');

class WalletManager {
    constructor(config = {}) {
        this.config = {
            walletDir: path.join(__dirname, '../../wallets'),
            encryptionAlgorithm: 'aes-256-gcm',
            keyDerivation: 'pbkdf2',
            iterations: 100000,
            saltLength: 32,
            ivLength: 16,
            ...config
        };
        
        this.wallets = new Map();
        this.isInitialized = false;
        
        this.ensureWalletDirectory();
    }
    
    /**
     * 确保钱包目录存在
     */
    async ensureWalletDirectory() {
        try {
            await fs.mkdir(this.config.walletDir, { recursive: true, mode: 0o700 });
            logger.info(`✅ 钱包目录已创建: ${this.config.walletDir}`);
        } catch (error) {
            logger.error('创建钱包目录失败:', error.message);
        }
    }
    
    /**
     * 从环境变量加载钱包
     */
    async loadFromEnv() {
        try {
            // 尝试多个环境变量名称
            let privateKey = process.env.SOLANA_PRIVATE_KEY || 
                            process.env.WALLET_PRIVATE_KEY || 
                            process.env.PRIVATE_KEY;
            
            const walletName = process.env.WALLET_NAME || 
                             process.env.SOLANA_WALLET_NAME || 
                             'default';
            
            if (!privateKey) {
                logger.warn('未找到钱包私钥环境变量，尝试从.env文件加载...');
                
                // 尝试从.env文件加载
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const envPath = path.join(__dirname, '../../.env');
                    
                    if (fs.existsSync(envPath)) {
                        const envContent = fs.readFileSync(envPath, 'utf8');
                        const envLines = envContent.split('\n');
                        
                        for (const line of envLines) {
                            if (line.startsWith('SOLANA_PRIVATE_KEY=')) {
                                privateKey = line.substring('SOLANA_PRIVATE_KEY='.length).trim();
                                break;
                            } else if (line.startsWith('WALLET_PRIVATE_KEY=')) {
                                privateKey = line.substring('WALLET_PRIVATE_KEY='.length).trim();
                                break;
                            }
                        }
                    }
                } catch (envError) {
                    logger.warn('从.env文件加载失败:', envError.message);
                }
                
                if (!privateKey) {
                    logger.warn('未找到任何钱包私钥');
                    return false;
                }
            }
            
            // 如果私钥已加密（包含加密标记）
            if (privateKey.startsWith('encrypted:')) {
                const password = process.env.WALLET_PASSWORD || 
                               process.env.SOLANA_WALLET_PASSWORD;
                
                if (!password) {
                    throw new Error('需要钱包密码来解密私钥');
                }
                
                const encryptedData = privateKey.substring('encrypted:'.length);
                const decryptedKey = await this.decryptPrivateKey(encryptedData, password);
                await this.importWallet(decryptedKey, walletName);
            } else {
                // 未加密的私钥
                logger.warn('警告：使用未加密的私钥，建议加密存储');
                await this.importWallet(privateKey, walletName);
            }
            
            logger.info(`✅ 钱包已加载: ${walletName}`);
            return true;
            
        } catch (error) {
            logger.error('加载钱包失败:', error.message);
            return false;
        }
    }
    
    /**
     * 导入钱包
     */
    async importWallet(privateKey, name = 'default') {
        try {
            // 验证私钥格式
            if (!this.isValidPrivateKey(privateKey)) {
                throw new Error('无效的私钥格式');
            }
            
            // 创建钱包对象
            const wallet = {
                name: name,
                publicKey: this.derivePublicKey(privateKey),
                createdAt: new Date().toISOString(),
                lastUsed: null,
                transactionCount: 0
            };
            
            this.wallets.set(name, {
                ...wallet,
                privateKey: privateKey
            });
            
            logger.info(`✅ 钱包已导入: ${name} (${wallet.publicKey})`);
            return wallet;
            
        } catch (error) {
            logger.error('导入钱包失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 导出钱包（加密）
     */
    async exportWallet(name, password) {
        try {
            const wallet = this.wallets.get(name);
            
            if (!wallet) {
                throw new Error(`钱包不存在: ${name}`);
            }
            
            // 加密私钥
            const encryptedKey = await this.encryptPrivateKey(wallet.privateKey, password);
            
            const exportData = {
                name: wallet.name,
                publicKey: wallet.publicKey,
                encryptedPrivateKey: `encrypted:${encryptedKey}`,
                createdAt: wallet.createdAt,
                version: '1.0'
            };
            
            logger.info(`✅ 钱包已导出: ${name}`);
            return exportData;
            
        } catch (error) {
            logger.error('导出钱包失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 保存钱包到文件（加密）
     */
    async saveWallet(name, password) {
        try {
            const wallet = this.wallets.get(name);
            
            if (!wallet) {
                throw new Error(`钱包不存在: ${name}`);
            }
            
            // 加密私钥
            const encryptedKey = await this.encryptPrivateKey(wallet.privateKey, password);
            
            const walletData = {
                name: wallet.name,
                publicKey: wallet.publicKey,
                encryptedPrivateKey: `encrypted:${encryptedKey}`,
                createdAt: wallet.createdAt,
                version: '1.0'
            };
            
            const filepath = path.join(this.config.walletDir, `${name}.json`);
            await fs.writeFile(filepath, JSON.stringify(walletData, null, 2), { mode: 0o600 });
            
            logger.info(`✅ 钱包已保存: ${filepath}`);
            return filepath;
            
        } catch (error) {
            logger.error('保存钱包失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 从文件加载钱包
     */
    async loadWallet(filepath, password) {
        try {
            const data = await fs.readFile(filepath, 'utf8');
            const walletData = JSON.parse(data);
            
            if (!walletData.encryptedPrivateKey || !walletData.encryptedPrivateKey.startsWith('encrypted:')) {
                throw new Error('钱包文件未加密或格式错误');
            }
            
            const encryptedKey = walletData.encryptedPrivateKey.substring('encrypted:'.length);
            const decryptedKey = await this.decryptPrivateKey(encryptedKey, password);
            
            const wallet = await this.importWallet(decryptedKey, walletData.name);
            wallet.createdAt = walletData.createdAt;
            
            logger.info(`✅ 钱包已加载: ${filepath}`);
            return wallet;
            
        } catch (error) {
            logger.error('加载钱包文件失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 加密私钥
     */
    async encryptPrivateKey(privateKey, password) {
        try {
            // 生成随机盐
            const salt = crypto.randomBytes(this.config.saltLength);
            
            // 从密码派生密钥
            const key = await this.deriveKey(password, salt);
            
            // 生成随机IV
            const iv = crypto.randomBytes(this.config.ivLength);
            
            // 创建加密器
            const cipher = crypto.createCipheriv(
                this.config.encryptionAlgorithm,
                key,
                iv
            );
            
            // 加密
            let encrypted = cipher.update(privateKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // 获取认证标签
            const authTag = cipher.getAuthTag().toString('hex');
            
            // 组合加密数据
            const encryptedData = {
                salt: salt.toString('hex'),
                iv: iv.toString('hex'),
                encrypted: encrypted,
                authTag: authTag,
                iterations: this.config.iterations,
                algorithm: this.config.encryptionAlgorithm
            };
            
            return JSON.stringify(encryptedData);
            
        } catch (error) {
            logger.error('加密私钥失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 解密私钥
     */
    async decryptPrivateKey(encryptedDataStr, password) {
        try {
            const encryptedData = JSON.parse(encryptedDataStr);
            
            // 解析加密数据
            const salt = Buffer.from(encryptedData.salt, 'hex');
            const iv = Buffer.from(encryptedData.iv, 'hex');
            const authTag = Buffer.from(encryptedData.authTag, 'hex');
            const encrypted = encryptedData.encrypted;
            
            // 从密码派生密钥
            const key = await this.deriveKey(password, salt, encryptedData.iterations);
            
            // 创建解密器
            const decipher = crypto.createDecipheriv(
                encryptedData.algorithm || this.config.encryptionAlgorithm,
                key,
                iv
            );
            decipher.setAuthTag(authTag);
            
            // 解密
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
            
        } catch (error) {
            logger.error('解密私钥失败:', error.message);
            throw new Error('密码错误或数据损坏');
        }
    }
    
    /**
     * 从密码派生密钥
     */
    async deriveKey(password, salt, iterations = this.config.iterations) {
        return new Promise((resolve, reject) => {
            crypto.pbkdf2(
                password,
                salt,
                iterations,
                32, // 256位密钥
                'sha256',
                (err, key) => {
                    if (err) reject(err);
                    else resolve(key);
                }
            );
        });
    }
    
    /**
     * 验证私钥格式
     */
    isValidPrivateKey(privateKey) {
        // Solana私钥通常是64字节的十六进制字符串或base58编码
        if (privateKey.length === 64 && /^[0-9a-fA-F]+$/.test(privateKey)) {
            return true;
        }
        
        // base58编码的私钥
        if (privateKey.length >= 32 && privateKey.length <= 88) {
            return true;
        }
        
        return false;
    }
    
    /**
     * 推导公钥（简化版本）
     */
    derivePublicKey(privateKey) {
        // 实际实现需要使用@solana/web3.js
        // 这里返回一个占位符
        const hash = crypto.createHash('sha256').update(privateKey).digest('hex');
        return `Sol${hash.substring(0, 32)}...`;
    }
    
    /**
     * 获取钱包
     */
    getWallet(name = 'default') {
        const wallet = this.wallets.get(name);
        
        if (!wallet) {
            return null;
        }
        
        // 返回不包含私钥的钱包信息
        const { privateKey, ...publicWallet } = wallet;
        return publicWallet;
    }
    
    /**
     * 获取钱包私钥（用于签名）
     */
    getPrivateKey(name = 'default') {
        const wallet = this.wallets.get(name);
        
        if (!wallet) {
            throw new Error(`钱包不存在: ${name}`);
        }
        
        wallet.lastUsed = new Date().toISOString();
        wallet.transactionCount++;
        
        return wallet.privateKey;
    }
    
    /**
     * 删除钱包
     */
    async deleteWallet(name) {
        try {
            this.wallets.delete(name);
            
            const filepath = path.join(this.config.walletDir, `${name}.json`);
            await fs.unlink(filepath);
            
            logger.info(`✅ 钱包已删除: ${name}`);
            return true;
            
        } catch (error) {
            logger.error('删除钱包失败:', error.message);
            return false;
        }
    }
    
    /**
     * 列出所有钱包
     */
    listWallets() {
        return Array.from(this.wallets.values()).map(wallet => ({
            name: wallet.name,
            publicKey: wallet.publicKey,
            createdAt: wallet.createdAt,
            lastUsed: wallet.lastUsed,
            transactionCount: wallet.transactionCount
        }));
    }
    
    /**
     * 生成助记词（BIP39）
     */
    generateMnemonic() {
        // 需要bip39库，这里返回占位符
        const words = [
            'abandon', 'ability', 'able', 'about', 'above', 'absent',
            'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident'
        ];
        return words.join(' ');
    }
    
    /**
     * 从助记词导入钱包
     */
    async importFromMnemonic(mnemonic, password = null) {
        // 需要bip39和@solana/web3.js库
        // 这里返回占位符实现
        logger.warn('助记词导入需要额外依赖，请使用其他方式导入钱包');
        throw new Error('需要安装bip39和@solana/web3.js库');
    }
    
    /**
     * 备份所有钱包
     */
    async backupWallets(backupDir, password) {
        try {
            await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
            
            for (const [name, wallet] of this.wallets) {
                const filepath = await this.saveWallet(name, password);
                const backupPath = path.join(backupDir, path.basename(filepath));
                await fs.copyFile(filepath, backupPath);
            }
            
            logger.info(`✅ 钱包备份完成: ${backupDir}`);
            return backupDir;
            
        } catch (error) {
            logger.error('备份钱包失败:', error.message);
            throw error;
        }
    }
    
    /**
     * 安全清理（清除内存中的私钥）
     */
    clearSensitiveData() {
        for (const [name, wallet] of this.wallets) {
            // 用随机数据覆盖私钥
            wallet.privateKey = crypto.randomBytes(64).toString('hex');
        }
        
        logger.info('✅ 敏感数据已清理');
    }
}

// 创建单例实例
const walletManager = new WalletManager();

module.exports = {
    WalletManager,
    walletManager,
    
    // 便捷函数
    loadFromEnv: () => walletManager.loadFromEnv(),
    importWallet: (privateKey, name) => walletManager.importWallet(privateKey, name),
    getWallet: (name) => walletManager.getWallet(name),
    getPrivateKey: (name) => walletManager.getPrivateKey(name),
    listWallets: () => walletManager.listWallets()
};