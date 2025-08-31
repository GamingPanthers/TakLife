const fs = require('fs');
const path = require('path');
const readline = require('readline');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function colorLog(text, color = 'reset') {
    console.log(`${colors[color]}${text}${colors.reset}`);
}

function question(prompt) {
    return new Promise((resolve) => {
        rl.question(`${colors.cyan}${prompt}${colors.reset}`, resolve);
    });
}

// Function to load existing .env values
function loadExistingEnv() {
    const envVars = {};
    if (fs.existsSync('.env')) {
        try {
            const envContent = fs.readFileSync('.env', 'utf8');
            const lines = envContent.split('\n');
            
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine && !trimmedLine.startsWith('#')) {
                    const [key, ...valueParts] = trimmedLine.split('=');
                    if (key && valueParts.length > 0) {
                        envVars[key.trim()] = valueParts.join('=').trim();
                    }
                }
            });
        } catch (error) {
            colorLog('Warning: Could not read existing .env file', 'yellow');
        }
    }
    return envVars;
}

async function setupBot() {
    console.clear();
    colorLog('╔═══════════════════════════════════════════════╗', 'bright');
    colorLog('║           Discord Bot Panel Setup            ║', 'bright');
    colorLog('║                MySQL Edition                  ║', 'bright');
    colorLog('║                                               ║', 'bright');
    colorLog('║  This setup will help you configure your     ║', 'bright');
    colorLog('║  Discord bot with MySQL database, web panel, ║', 'bright');
    colorLog('║  support tickets, and Arma 3 monitoring.     ║', 'bright');
    colorLog('╚═══════════════════════════════════════════════╝', 'bright');
    console.log('');

    try {
        let existingEnv = {};
        let useExisting = false;

        // Check if .env already exists
        if (fs.existsSync('.env')) {
            existingEnv = loadExistingEnv();
            colorLog('📄 Existing .env file found!', 'yellow');
            colorLog('Current configuration detected:', 'blue');
            
            // Show some key existing values (without sensitive info)
            if (existingEnv.DB_HOST) colorLog(`  - Database Host: ${existingEnv.DB_HOST}`, 'reset');
            if (existingEnv.DB_NAME) colorLog(`  - Database Name: ${existingEnv.DB_NAME}`, 'reset');
            if (existingEnv.GUILD_ID) colorLog(`  - Discord Server ID: ${existingEnv.GUILD_ID}`, 'reset');
            if (existingEnv.PORT) colorLog(`  - Web Panel Port: ${existingEnv.PORT}`, 'reset');
            
            console.log('');
            const overwrite = await question('Do you want to overwrite the existing .env file? (y/N): ');
            
            if (overwrite.toLowerCase() !== 'y') {
                useExisting = true;
                colorLog('✅ Using existing .env file. Continuing with database setup...', 'green');
                console.log('');
            } else {
                colorLog('🔄 Will create new .env file with fresh configuration...', 'blue');
                console.log('');
            }
        }

        let dbConfig = {};
        let botConfig = {};
        let arma3Config = {};
        let channelConfig = {};
        let webConfig = {};
        let adminConfig = {};
        let optionalConfig = {};

        if (useExisting) {
            // Use existing configuration but still ask for missing critical values
            dbConfig = {
                host: existingEnv.DB_HOST,
                port: existingEnv.DB_PORT,
                user: existingEnv.DB_USER,
                password: existingEnv.DB_PASSWORD,
                name: existingEnv.DB_NAME
            };

            botConfig = {
                token: existingEnv.DISCORD_TOKEN,
                clientId: existingEnv.CLIENT_ID,
                guildId: existingEnv.GUILD_ID
            };

            // Check for missing critical database config
            if (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.name) {
                colorLog('⚠️  Missing critical database configuration. Please provide:', 'yellow');
                
                if (!dbConfig.host) dbConfig.host = await question('Enter MySQL host (default: localhost): ') || 'localhost';
                if (!dbConfig.port) dbConfig.port = await question('Enter MySQL port (default: 3306): ') || '3306';
                if (!dbConfig.user) dbConfig.user = await question('Enter MySQL username: ');
                if (!dbConfig.password) dbConfig.password = await question('Enter MySQL password: ');
                if (!dbConfig.name) dbConfig.name = await question('Enter MySQL database name (default: discord_bot): ') || 'discord_bot';
            }

            // Check for missing critical bot config
            if (!botConfig.token || !botConfig.clientId || !botConfig.guildId) {
                colorLog('⚠️  Missing critical Discord bot configuration. Please provide:', 'yellow');
                
                if (!botConfig.token) botConfig.token = await question('Enter your Discord bot token: ');
                if (!botConfig.clientId) botConfig.clientId = await question('Enter your Discord application ID: ');
                if (!botConfig.guildId) botConfig.guildId = await question('Enter your Discord server ID: ');
            }

            // Use existing admin config or create new
            adminConfig = {
                username: existingEnv.ADMIN_USERNAME || 'admin',
                password: existingEnv.ADMIN_PASSWORD
            };

            if (!adminConfig.password) {
                colorLog('⚠️  Admin password not found or needs update:', 'yellow');
                adminConfig.password = await question('Enter admin password for web panel: ');
            }

            // Load existing optional config
            arma3Config = {
                ARMA3_BOT_TOKEN: existingEnv.ARMA3_BOT_TOKEN,
                ARMA3_SERVER_IP: existingEnv.ARMA3_SERVER_IP,
                ARMA3_SERVER_PORT: existingEnv.ARMA3_SERVER_PORT,
                ARMA3_STATUS_CHANNEL_ID: existingEnv.ARMA3_STATUS_CHANNEL_ID,
                ARMA3_AUTH_TOKEN: existingEnv.ARMA3_AUTH_TOKEN || generateRandomToken()
            };

            channelConfig = {
                modLogChannelId: existingEnv.MOD_LOG_CHANNEL_ID,
                changelogChannelId: existingEnv.CHANGELOG_CHANNEL_ID,
                supportCategoryId: existingEnv.SUPPORT_CATEGORY_ID
            };

            webConfig = {
                port: existingEnv.PORT || '3000',
                sessionSecret: existingEnv.SESSION_SECRET || generateRandomToken()
            };

            optionalConfig = {
                openaiKey: existingEnv.OPENAI_API_KEY,
                githubToken: existingEnv.GITHUB_TOKEN,
                githubRepo: existingEnv.GITHUB_REPO
            };

        } else {
            // Fresh setup - ask for all configuration
            colorLog('📋 Let\'s gather your configuration...', 'blue');
            console.log('');

            // MySQL Database Configuration
            colorLog('🗄️  MySQL Database Configuration', 'magenta');
            dbConfig.host = await question('Enter MySQL host (default: localhost): ') || 'localhost';
            dbConfig.port = await question('Enter MySQL port (default: 3306): ') || '3306';
            dbConfig.user = await question('Enter MySQL username: ');
            dbConfig.password = await question('Enter MySQL password: ');
            dbConfig.name = await question('Enter MySQL database name (default: discord_bot): ') || 'discord_bot';

            // Discord Bot Configuration
            colorLog('\n🤖 Discord Bot Configuration', 'magenta');
            botConfig.token = await question('Enter your Discord bot token: ');
            botConfig.clientId = await question('Enter your Discord application ID: ');
            botConfig.guildId = await question('Enter your Discord server ID: ');

            // Arma 3 Bot Configuration (optional)
            colorLog('\n🎮 Arma 3 Status Bot (Optional)', 'magenta');
            const setupArma = await question('Do you want to setup Arma 3 server monitoring? (y/N): ');
            
            if (setupArma.toLowerCase() === 'y') {
                arma3Config.ARMA3_BOT_TOKEN = await question('Enter Arma 3 status bot token: ');
                arma3Config.ARMA3_SERVER_IP = await question('Enter Arma 3 server IP (default: 127.0.0.1): ') || '127.0.0.1';
                arma3Config.ARMA3_SERVER_PORT = await question('Enter Arma 3 server port (default: 2302): ') || '2302';
                arma3Config.ARMA3_STATUS_CHANNEL_ID = await question('Enter channel ID for Arma 3 status updates: ');
                arma3Config.ARMA3_AUTH_TOKEN = generateRandomToken();
                colorLog(`Generated Arma 3 auth token: ${arma3Config.ARMA3_AUTH_TOKEN}`, 'green');
            } else {
                arma3Config.ARMA3_AUTH_TOKEN = generateRandomToken();
            }

            // Channel Configuration
            colorLog('\n📺 Channel Configuration', 'magenta');
            channelConfig.modLogChannelId = await question('Enter mod log channel ID (optional): ');
            channelConfig.changelogChannelId = await question('Enter changelog channel ID (optional): ');
            channelConfig.supportCategoryId = await question('Enter support tickets category ID (optional): ');

            // Web Panel Configuration
            colorLog('\n🌐 Web Panel Configuration', 'magenta');
            webConfig.port = await question('Enter web panel port (default: 3000): ') || '3000';
            webConfig.sessionSecret = generateRandomToken();
            
            // Admin Account
            colorLog('\n👑 Admin Account Creation', 'magenta');
            adminConfig.username = await question('Enter admin username (default: admin): ') || 'admin';
            adminConfig.password = await question('Enter admin password: ');
            
            if (adminConfig.password.length < 6) {
                colorLog('⚠️  Warning: Password should be at least 6 characters long!', 'yellow');
            }

            // AI Configuration (optional)
            colorLog('\n🧠 AI Support Configuration (Optional)', 'magenta');
            const setupAI = await question('Do you want to enable AI-powered support responses? (y/N): ');
            if (setupAI.toLowerCase() === 'y') {
                optionalConfig.openaiKey = await question('Enter your OpenAI API key: ');
            }

            // GitHub Integration (optional)
            colorLog('\n📱 GitHub Integration (Optional)', 'magenta');
            const setupGithub = await question('Do you want to enable GitHub release monitoring? (y/N): ');
            if (setupGithub.toLowerCase() === 'y') {
                optionalConfig.githubToken = await question('Enter your GitHub personal access token: ');
                optionalConfig.githubRepo = await question('Enter repository (username/repo-name): ');
            }
        }

        // Test MySQL connection
        colorLog('\n🔌 Testing MySQL connection...', 'blue');
        await testMySQLConnection(dbConfig.host, dbConfig.port, dbConfig.user, dbConfig.password, dbConfig.name);

        // Create .env file (only if not using existing or if overwriting)
        if (!useExisting) {
            colorLog('\n📝 Creating configuration files...', 'blue');
            
            const envContent = `# MySQL Database Configuration
DB_HOST=${dbConfig.host}
DB_PORT=${dbConfig.port}
DB_USER=${dbConfig.user}
DB_PASSWORD=${dbConfig.password}
DB_NAME=${dbConfig.name}

# Discord Bot Configuration
DISCORD_TOKEN=${botConfig.token}
CLIENT_ID=${botConfig.clientId}
GUILD_ID=${botConfig.guildId}

# Arma 3 Configuration
${arma3Config.ARMA3_BOT_TOKEN ? `ARMA3_BOT_TOKEN=${arma3Config.ARMA3_BOT_TOKEN}` : '# ARMA3_BOT_TOKEN=your_arma3_bot_token'}
${arma3Config.ARMA3_SERVER_IP ? `ARMA3_SERVER_IP=${arma3Config.ARMA3_SERVER_IP}` : '# ARMA3_SERVER_IP=127.0.0.1'}
${arma3Config.ARMA3_SERVER_PORT ? `ARMA3_SERVER_PORT=${arma3Config.ARMA3_SERVER_PORT}` : '# ARMA3_SERVER_PORT=2302'}
${arma3Config.ARMA3_STATUS_CHANNEL_ID ? `ARMA3_STATUS_CHANNEL_ID=${arma3Config.ARMA3_STATUS_CHANNEL_ID}` : '# ARMA3_STATUS_CHANNEL_ID=your_channel_id'}
${arma3Config.ARMA3_AUTH_TOKEN ? `ARMA3_AUTH_TOKEN=${arma3Config.ARMA3_AUTH_TOKEN}` : '# ARMA3_AUTH_TOKEN=secure_random_token'}

# Channel Configuration
${channelConfig.modLogChannelId ? `MOD_LOG_CHANNEL_ID=${channelConfig.modLogChannelId}` : '# MOD_LOG_CHANNEL_ID=your_mod_log_channel_id'}
${channelConfig.changelogChannelId ? `CHANGELOG_CHANNEL_ID=${channelConfig.changelogChannelId}` : '# CHANGELOG_CHANNEL_ID=your_changelog_channel_id'}
${channelConfig.supportCategoryId ? `SUPPORT_CATEGORY_ID=${channelConfig.supportCategoryId}` : '# SUPPORT_CATEGORY_ID=your_support_category_id'}

# Web Panel Configuration
PORT=${webConfig.port}
SESSION_SECRET=${webConfig.sessionSecret}

# AI Configuration
${optionalConfig.openaiKey ? `OPENAI_API_KEY=${optionalConfig.openaiKey}` : '# OPENAI_API_KEY=your_openai_api_key'}

# GitHub Configuration
${optionalConfig.githubToken ? `GITHUB_TOKEN=${optionalConfig.githubToken}` : '# GITHUB_TOKEN=your_github_token'}
${optionalConfig.githubRepo ? `GITHUB_REPO=${optionalConfig.githubRepo}` : '# GITHUB_REPO=username/repo-name'}

# Security Settings
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOGIN_COOLDOWN=300000

# AutoMod Default Settings
AUTOMOD_SPAM_DETECTION=true
AUTOMOD_PROFANITY_FILTER=true
AUTOMOD_LINK_FILTER=false
AUTOMOD_MAX_MENTIONS=5
AUTOMOD_MAX_MESSAGES=10
AUTOMOD_TIME_WINDOW=10

# Admin Account (for initial setup)
ADMIN_USERNAME=${adminConfig.username}
ADMIN_PASSWORD=${adminConfig.password}
`;

            fs.writeFileSync('.env', envContent);
            colorLog('✅ .env file created successfully!', 'green');
        } else {
            colorLog('✅ Using existing .env configuration', 'green');
        }

        // Create public directory if it doesn't exist
        if (!fs.existsSync('public')) {
            fs.mkdirSync('public');
            colorLog('✅ Created public directory', 'green');
        }

        // Initialize database and create admin user
        colorLog('\n🗄️  Initializing MySQL database...', 'blue');
        await initializeDatabase(dbConfig.host, dbConfig.port, dbConfig.user, dbConfig.password, dbConfig.name, adminConfig.username, adminConfig.password);

        // Create startup scripts
        createStartupScripts();

        colorLog('\n🎉 Setup completed successfully!', 'green');
        console.log('');
        colorLog('📋 Next steps:', 'bright');
        colorLog('1. Make sure you have created the other required files (index.js, arma3-bot.js, etc.)', 'cyan');
        colorLog('2. Install dependencies: npm install', 'cyan');
        colorLog('3. Start the main bot: npm start', 'cyan');
        if (arma3Config.ARMA3_BOT_TOKEN) {
            colorLog('4. Start the Arma 3 bot: npm run arma-bot', 'cyan');
        }
        colorLog(`${arma3Config.ARMA3_BOT_TOKEN ? '5' : '4'}. Open web panel: http://localhost:${webConfig.port || '3000'}`, 'cyan');
        colorLog(`${arma3Config.ARMA3_BOT_TOKEN ? '6' : '5'}. Login with username: ${adminConfig.username}`, 'cyan');
        console.log('');
        if (useExisting) {
            colorLog('📝 Note: Your existing .env file was preserved with updated database setup!', 'yellow');
        }
        colorLog('📖 MySQL database and tables have been created!', 'green');

    } catch (error) {
        colorLog(`\n❌ Setup failed: ${error.message}`, 'red');
        process.exit(1);
    } finally {
        rl.close();
    }
}

async function testMySQLConnection(host, port, user, password, database) {
    try {
        // First, connect without specifying database to check connection
        const connection = await mysql.createConnection({
            host: host,
            port: parseInt(port),
            user: user,
            password: password
        });

        // Try to create database if it doesn't exist
        await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
        colorLog('✅ MySQL connection successful!', 'green');
        
        await connection.end();
    } catch (error) {
        colorLog(`❌ MySQL connection failed: ${error.message}`, 'red');
        colorLog('Please check your MySQL credentials and make sure MySQL server is running.', 'yellow');
        throw error;
    }
}

function generateRandomToken() {
    return require('crypto').randomBytes(32).toString('hex');
}

async function initializeDatabase(host, port, user, password, database, adminUsername, adminPassword) {
    try {
        const connection = await mysql.createConnection({
            host: host,
            port: parseInt(port),
            user: user,
            password: password,
            database: database
        });

        // Create tables
        const tables = [
            `CREATE TABLE IF NOT EXISTS tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id VARCHAR(255) UNIQUE NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                username VARCHAR(255) NOT NULL,
                channel_id VARCHAR(255) NOT NULL,
                status ENUM('open', 'closed') DEFAULT 'open',
                category VARCHAR(100) NOT NULL,
                priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMP NULL,
                closed_by VARCHAR(255) NULL,
                transcript LONGTEXT NULL,
                INDEX idx_user_id (user_id),
                INDEX idx_status (status),
                INDEX idx_created_at (created_at)
            )`,
            
            `CREATE TABLE IF NOT EXISTS mod_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                action_type VARCHAR(50) NOT NULL,
                moderator_id VARCHAR(255) NOT NULL,
                moderator_name VARCHAR(255) NOT NULL,
                target_id VARCHAR(255) NULL,
                target_name VARCHAR(255) NULL,
                reason TEXT NULL,
                duration VARCHAR(100) NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                guild_id VARCHAR(255) NOT NULL,
                INDEX idx_action_type (action_type),
                INDEX idx_moderator_id (moderator_id),
                INDEX idx_target_id (target_id),
                INDEX idx_timestamp (timestamp)
            )`,
            
            `CREATE TABLE IF NOT EXISTS command_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                command_name VARCHAR(100) NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                username VARCHAR(255) NOT NULL,
                channel_id VARCHAR(255) NOT NULL,
                channel_name VARCHAR(255) NOT NULL,
                guild_id VARCHAR(255) NOT NULL,
                arguments TEXT NULL,
                response TEXT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_command_name (command_name),
                INDEX idx_user_id (user_id),
                INDEX idx_timestamp (timestamp)
            )`,
            
            `CREATE TABLE IF NOT EXISTS automod_settings (
                guild_id VARCHAR(255) PRIMARY KEY,
                spam_detection BOOLEAN DEFAULT TRUE,
                profanity_filter BOOLEAN DEFAULT TRUE,
                link_filter BOOLEAN DEFAULT FALSE,
                max_mentions INT DEFAULT 5,
                max_messages INT DEFAULT 10,
                time_window INT DEFAULT 10,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )`,
            
            `CREATE TABLE IF NOT EXISTS arma3_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                event_type ENUM('connect', 'disconnect', 'kill', 'money', 'other') NOT NULL,
                player_name VARCHAR(255) NOT NULL,
                player_id VARCHAR(255) NULL,
                target_name VARCHAR(255) NULL,
                target_id VARCHAR(255) NULL,
                weapon VARCHAR(255) NULL,
                money_amount INT NULL,
                distance DECIMAL(10, 2) NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                server_name VARCHAR(255) NULL,
                additional_data JSON NULL,
                INDEX idx_event_type (event_type),
                INDEX idx_player_id (player_id),
                INDEX idx_timestamp (timestamp),
                INDEX idx_server_name (server_name)
            )`,
            
            `CREATE TABLE IF NOT EXISTS panel_users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                discord_id VARCHAR(255) NULL,
                role ENUM('admin', 'moderator', 'staff') DEFAULT 'staff',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL,
                login_attempts INT DEFAULT 0,
                locked_until TIMESTAMP NULL,
                INDEX idx_username (username),
                INDEX idx_discord_id (discord_id)
            )`
        ];

        // Execute table creation queries
        for (const tableQuery of tables) {
            await connection.execute(tableQuery);
        }
        
        colorLog('✅ Database tables created successfully!', 'green');

        // Create/update admin user
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await connection.execute(
            'INSERT INTO panel_users (username, password_hash, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)',
            [adminUsername, passwordHash, 'admin']
        );
        
        colorLog('✅ Admin user created/updated successfully!', 'green');
        
        // Insert default automod settings if needed
        await connection.execute(
            'INSERT IGNORE INTO automod_settings (guild_id) VALUES (?)',
            ['default']
        );
        
        await connection.end();
        
    } catch (error) {
        colorLog(`❌ Database initialization failed: ${error.message}`, 'red');
        throw error;
    }
}

function createStartupScripts() {
    // Create start.bat for Windows
    const startBat = `@echo off
echo Starting Discord Bot Panel...
echo.

echo Starting main bot...
start "Main Bot" cmd /k "npm start"

timeout /t 3 /nobreak > nul

echo Starting Arma 3 status bot...
start "Arma 3 Bot" cmd /k "npm run arma-bot"

echo.
echo Both bots are starting...
echo Web panel will be available at http://localhost:3000
echo.
pause`;

    fs.writeFileSync('start.bat', startBat);

    // Create start.sh for Linux/Mac
    const startSh = `#!/bin/bash
echo "Starting Discord Bot Panel..."
echo

echo "Starting main bot..."
npm start &
MAIN_PID=$!

sleep 3

echo "Starting Arma 3 status bot..."
npm run arma-bot &
ARMA_PID=$!

echo
echo "Both bots are running..."
echo "Main Bot PID: $MAIN_PID"
echo "Arma 3 Bot PID: $ARMA_PID"
echo "Web panel available at http://localhost:3000"
echo
echo "Press Ctrl+C to stop all processes"

# Wait for user interrupt
trap "echo 'Stopping bots...'; kill $MAIN_PID $ARMA_PID; exit" INT
wait`;

    fs.writeFileSync('start.sh', startSh);
    
    // Make start.sh executable on Unix systems
    try {
        fs.chmodSync('start.sh', '755');
    } catch (err) {
        // Ignore on Windows
    }

    colorLog('✅ Created startup scripts (start.bat and start.sh)', 'green');
}

// Start setup
setupBot().catch(console.error);