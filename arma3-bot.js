const { Client, GatewayIntentBits, EmbedBuilder, ActivityType } = require('discord.js');
const Gamedig = require('gamedig');
require('dotenv').config();

// Initialize Discord client for Arma 3 bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Server configuration
const SERVERS = [
    {
        name: 'Takistan Life',
        type: 'arma3',
        host: process.env.ARMA3_SERVER_IP || '127.0.0.1',
        port: parseInt(process.env.ARMA3_SERVER_PORT) || 2302,
        channelId: process.env.ARMA3_STATUS_CHANNEL_ID
    }
    // Add more servers as needed
];

let statusMessages = new Map(); // Store message IDs for editing
let lastServerStatus = new Map(); // Store last known status for change detection

// Bot ready event
client.once('ready', async () => {
    console.log(`Arma 3 Status Bot (${client.user.tag}) is online!`);
    
    // Start monitoring servers
    startServerMonitoring();
    
    // Set initial bot status
    updateBotStatus();
});

// Server monitoring function
async function startServerMonitoring() {
    // Initial status check
    await checkAllServers();
    
    // Set up interval for regular checks (every 60 seconds)
    setInterval(async () => {
        await checkAllServers();
        updateBotStatus();
    }, 60000);
}

async function checkAllServers() {
    for (const server of SERVERS) {
        await checkServerStatus(server);
    }
}

async function checkServerStatus(serverConfig) {
    try {
        const state = await Gamedig.query({
            type: serverConfig.type,
            host: serverConfig.host,
            port: serverConfig.port,
            socketTimeout: 10000,
            attemptTimeout: 10000
        });
        
        const serverStatus = {
            online: true,
            name: state.name || serverConfig.name,
            players: state.players.length,
            maxPlayers: state.maxplayers,
            map: state.map || 'Unknown',
            gameMode: state.gamemode || 'Unknown',
            ping: state.ping || 0,
            players_list: state.players.map(p => ({
                name: p.name,
                score: p.score,
                time: p.time
            })),
            lastUpdated: new Date()
        };
        
        await updateStatusMessage(serverConfig, serverStatus);
        
        // Check for status changes
        const lastStatus = lastServerStatus.get(serverConfig.name);
        if (lastStatus) {
            await checkStatusChanges(serverConfig, lastStatus, serverStatus);
        }
        
        lastServerStatus.set(serverConfig.name, serverStatus);
        
    } catch (error) {
        console.error(`Error checking ${serverConfig.name}:`, error.message);
        
        const serverStatus = {
            online: false,
            name: serverConfig.name,
            error: error.message,
            lastUpdated: new Date()
        };
        
        await updateStatusMessage(serverConfig, serverStatus);
        
        // Check for status changes
        const lastStatus = lastServerStatus.get(serverConfig.name);
        if (lastStatus && lastStatus.online) {
            await notifyServerDown(serverConfig, serverStatus);
        }
        
        lastServerStatus.set(serverConfig.name, serverStatus);
    }
}

async function updateStatusMessage(serverConfig, status) {
    if (!serverConfig.channelId) return;
    
    const channel = client.channels.cache.get(serverConfig.channelId);
    if (!channel) return;
    
    const embed = createStatusEmbed(status);
    const messageId = statusMessages.get(serverConfig.name);
    
    try {
        if (messageId) {
            // Edit existing message
            const message = await channel.messages.fetch(messageId);
            await message.edit({ embeds: [embed] });
        } else {
            // Send new message
            const message = await channel.send({ embeds: [embed] });
            statusMessages.set(serverConfig.name, message.id);
        }
    } catch (error) {
        console.error('Error updating status message:', error);
        // If message doesn't exist, send a new one
        try {
            const message = await channel.send({ embeds: [embed] });
            statusMessages.set(serverConfig.name, message.id);
        } catch (sendError) {
            console.error('Error sending status message:', sendError);
        }
    }
}

function createStatusEmbed(status) {
    const embed = new EmbedBuilder()
        .setTitle(`${status.name}`)
        .setTimestamp(status.lastUpdated);
    
    if (status.online) {
        embed
            .setColor(0x00FF00)
            .setDescription('🟢 **Server Online**')
            .addFields(
                { name: '👥 Players', value: `${status.players}/${status.maxPlayers}`, inline: true },
                { name: '🗺️ Map', value: status.map, inline: true },
                { name: '🎯 Game Mode', value: status.gameMode, inline: true },
                { name: '📡 Ping', value: `${status.ping}ms`, inline: true }
            );
        
        // Add player list if there are players
        if (status.players_list && status.players_list.length > 0) {
            const playerList = status.players_list
                .slice(0, 10) // Limit to first 10 players
                .map(p => `• ${p.name}${p.score ? ` (${p.score})` : ''}`)
                .join('\n');
            
            embed.addFields({
                name: `👤 Players Online (${status.players_list.length > 10 ? '10/' + status.players_list.length : status.players_list.length})`,
                value: playerList || 'No players online',
                inline: false
            });
        }
    } else {
        embed
            .setColor(0xFF0000)
            .setDescription('🔴 **Server Offline**')
            .addFields(
                { name: '❌ Status', value: 'Server is not responding', inline: true },
                { name: '⚠️ Error', value: status.error ? status.error.substring(0, 100) : 'Unknown error', inline: false }
            );
    }
    
    return embed;
}

async function checkStatusChanges(serverConfig, lastStatus, currentStatus) {
    if (!serverConfig.channelId) return;
    
    const channel = client.channels.cache.get(serverConfig.channelId);
    if (!channel) return;
    
    // Server came online
    if (!lastStatus.online && currentStatus.online) {
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🟢 Server Online')
            .setDescription(`**${currentStatus.name}** is now online!`)
            .addFields(
                { name: '👥 Players', value: `${currentStatus.players}/${currentStatus.maxPlayers}`, inline: true },
                { name: '🗺️ Map', value: currentStatus.map, inline: true }
            )
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
    }
    
    // Server went offline
    if (lastStatus.online && !currentStatus.online) {
        await notifyServerDown(serverConfig, currentStatus);
    }
    
    // Player count changed significantly (if server is online)
    if (currentStatus.online && lastStatus.online) {
        const playerDiff = currentStatus.players - lastStatus.players;
        
        if (Math.abs(playerDiff) >= 5) { // Notify for changes of 5 or more players
            const embed = new EmbedBuilder()
                .setColor(playerDiff > 0 ? 0x00FF00 : 0xFFA500)
                .setTitle(playerDiff > 0 ? '📈 Players Joined' : '📉 Players Left')
                .setDescription(`Player count changed from ${lastStatus.players} to ${currentStatus.players}`)
                .addFields(
                    { name: 'Current Players', value: `${currentStatus.players}/${currentStatus.maxPlayers}`, inline: true },
                    { name: 'Change', value: `${playerDiff > 0 ? '+' : ''}${playerDiff}`, inline: true }
                )
                .setTimestamp();
            
            await channel.send({ embeds: [embed] });
        }
    }
}

async function notifyServerDown(serverConfig, status) {
    if (!serverConfig.channelId) return;
    
    const channel = client.channels.cache.get(serverConfig.channelId);
    if (!channel) return;
    
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🔴 Server Offline')
        .setDescription(`**${status.name}** has gone offline!`)
        .addFields(
            { name: '⚠️ Error', value: status.error ? status.error.substring(0, 200) : 'Server is not responding', inline: false }
        )
        .setTimestamp();
    
    await channel.send({ embeds: [embed] });
}

function updateBotStatus() {
    const onlineServers = Array.from(lastServerStatus.values()).filter(s => s.online);
    const totalPlayers = onlineServers.reduce((sum, s) => sum + s.players, 0);
    
    if (onlineServers.length === 0) {
        client.user.setActivity('All servers offline', { type: ActivityType.Watching });
    } else {
        client.user.setActivity(`${totalPlayers} players on ${onlineServers.length} server${onlineServers.length !== 1 ? 's' : ''}`, { type: ActivityType.Watching });
    }
}

// Manual server check command
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!arma')) return;
    
    const args = message.content.slice(5).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    switch (command) {
        case 'status':
            await handleStatusCommand(message);
            break;
        case 'check':
            await handleCheckCommand(message);
            break;
        case 'players':
            await handlePlayersCommand(message, args[0]);
            break;
        case 'help':
            await handleHelpCommand(message);
            break;
    }
});

async function handleStatusCommand(message) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📊 Server Status Overview')
        .setTimestamp();
    
    if (lastServerStatus.size === 0) {
        embed.setDescription('No server data available yet. Please wait for the next check.');
    } else {
        let description = '';
        let totalOnline = 0;
        let totalPlayers = 0;
        
        for (const [serverName, status] of lastServerStatus) {
            const statusIcon = status.online ? '🟢' : '🔴';
            const statusText = status.online ? 'Online' : 'Offline';
            const playerInfo = status.online ? ` (${status.players}/${status.maxPlayers})` : '';
            
            description += `${statusIcon} **${serverName}**: ${statusText}${playerInfo}\n`;
            
            if (status.online) {
                totalOnline++;
                totalPlayers += status.players;
            }
        }
        
        embed.setDescription(description);
        embed.addFields(
            { name: 'Servers Online', value: `${totalOnline}/${lastServerStatus.size}`, inline: true },
            { name: 'Total Players', value: totalPlayers.toString(), inline: true }
        );
    }
    
    await message.reply({ embeds: [embed] });
}

async function handleCheckCommand(message) {
    const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🔄 Checking Servers...')
        .setDescription('Performing manual server check...')
        .setTimestamp();
    
    const checkMessage = await message.reply({ embeds: [embed] });
    
    await checkAllServers();
    
    const updatedEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Server Check Complete')
        .setDescription('All servers have been checked. Status messages updated.')
        .setTimestamp();
    
    await checkMessage.edit({ embeds: [updatedEmbed] });
}

async function handlePlayersCommand(message, serverName) {
    let targetServer;
    
    if (serverName) {
        targetServer = Array.from(lastServerStatus.entries())
            .find(([name, status]) => name.toLowerCase().includes(serverName.toLowerCase()));
    } else if (lastServerStatus.size === 1) {
        targetServer = Array.from(lastServerStatus.entries())[0];
    }
    
    if (!targetServer) {
        return message.reply('Please specify a server name or ensure only one server is configured.');
    }
    
    const [name, status] = targetServer;
    
    const embed = new EmbedBuilder()
        .setTitle(`👥 Players on ${name}`)
        .setTimestamp();
    
    if (!status.online) {
        embed
            .setColor(0xFF0000)
            .setDescription('Server is currently offline.');
    } else if (!status.players_list || status.players_list.length === 0) {
        embed
            .setColor(0xFFA500)
            .setDescription('No players currently online.');
    } else {
        embed
            .setColor(0x00FF00)
            .setDescription(`**${status.players}** players online:`)
            .addFields({
                name: 'Player List',
                value: status.players_list
                    .map((p, i) => `${i + 1}. ${p.name}${p.score ? ` (Score: ${p.score})` : ''}`)
                    .join('\n')
                    .substring(0, 1020) // Discord field limit
            });
    }
    
    await message.reply({ embeds: [embed] });
}

async function handleHelpCommand(message) {
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('🤖 Arma 3 Bot Commands')
        .setDescription('Available commands for server monitoring:')
        .addFields(
            { name: '!arma status', value: 'Show overview of all servers', inline: false },
            { name: '!arma check', value: 'Manually check all servers', inline: false },
            { name: '!arma players [server]', value: 'List players on a specific server', inline: false },
            { name: '!arma help', value: 'Show this help message', inline: false }
        )
        .setFooter({ text: 'Server status updates automatically every 60 seconds' })
        .setTimestamp();
    
    await message.reply({ embeds: [embed] });
}

// Error handling
client.on('error', console.error);
client.on('warn', console.warn);

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the bot
client.login(process.env.ARMA3_BOT_TOKEN);