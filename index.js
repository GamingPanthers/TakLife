const { Client, GatewayIntentBits, Collection, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const session = require('express-session');
const axios = require('axios');
const { Octokit } = require('@octokit/rest');
const OpenAI = require('openai');
require('dotenv').config();

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.DirectMessages
    ]
});

// Initialize collections
client.commands = new Collection();
client.cooldowns = new Collection();

// Initialize database
const db = new sqlite3.Database('./bot_database.db');

// Initialize OpenAI for AI support
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Initialize GitHub API
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

// Database setup
db.serialize(() => {
    // Support tickets table
    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id TEXT UNIQUE,
        user_id TEXT,
        username TEXT,
        channel_id TEXT,
        status TEXT DEFAULT 'open',
        category TEXT,
        priority TEXT DEFAULT 'medium',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        closed_by TEXT,
        transcript TEXT
    )`);

    // Moderation logs table
    db.run(`CREATE TABLE IF NOT EXISTS mod_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT,
        moderator_id TEXT,
        moderator_name TEXT,
        target_id TEXT,
        target_name TEXT,
        reason TEXT,
        duration TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        guild_id TEXT
    )`);

    // Command logs table
    db.run(`CREATE TABLE IF NOT EXISTS command_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command_name TEXT,
        user_id TEXT,
        username TEXT,
        channel_id TEXT,
        channel_name TEXT,
        guild_id TEXT,
        arguments TEXT,
        response TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Automod settings table
    db.run(`CREATE TABLE IF NOT EXISTS automod_settings (
        guild_id TEXT PRIMARY KEY,
        spam_detection BOOLEAN DEFAULT 1,
        profanity_filter BOOLEAN DEFAULT 1,
        link_filter BOOLEAN DEFAULT 0,
        max_mentions INTEGER DEFAULT 5,
        max_messages INTEGER DEFAULT 10,
        time_window INTEGER DEFAULT 10
    )`);

    // Arma 3 logs table
    db.run(`CREATE TABLE IF NOT EXISTS arma3_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT,
        player_name TEXT,
        player_id TEXT,
        target_name TEXT,
        target_id TEXT,
        weapon TEXT,
        money_amount INTEGER,
        distance REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        server_name TEXT
    )`);

    // Web panel users table
    db.run(`CREATE TABLE IF NOT EXISTS panel_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password_hash TEXT,
        discord_id TEXT,
        role TEXT DEFAULT 'staff',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Moderation Commands
const moderationCommands = [
    {
        name: 'kick',
        description: 'Kick a member from the server',
        options: [
            {
                name: 'user',
                description: 'The user to kick',
                type: 6,
                required: true
            },
            {
                name: 'reason',
                description: 'Reason for the kick',
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'ban',
        description: 'Ban a member from the server',
        options: [
            {
                name: 'user',
                description: 'The user to ban',
                type: 6,
                required: true
            },
            {
                name: 'reason',
                description: 'Reason for the ban',
                type: 3,
                required: false
            },
            {
                name: 'delete_days',
                description: 'Days of messages to delete (0-7)',
                type: 4,
                required: false
            }
        ]
    },
    {
        name: 'timeout',
        description: 'Timeout a member',
        options: [
            {
                name: 'user',
                description: 'The user to timeout',
                type: 6,
                required: true
            },
            {
                name: 'duration',
                description: 'Duration in minutes',
                type: 4,
                required: true
            },
            {
                name: 'reason',
                description: 'Reason for the timeout',
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'unban',
        description: 'Unban a user',
        options: [
            {
                name: 'user_id',
                description: 'The user ID to unban',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'clear',
        description: 'Clear messages from a channel',
        options: [
            {
                name: 'amount',
                description: 'Number of messages to delete (1-100)',
                type: 4,
                required: true
            }
        ]
    },
    {
        name: 'ticket',
        description: 'Create a support ticket',
        options: [
            {
                name: 'category',
                description: 'Ticket category',
                type: 3,
                required: true,
                choices: [
                    { name: 'General Support', value: 'general' },
                    { name: 'Bug Report', value: 'bug' },
                    { name: 'Feature Request', value: 'feature' },
                    { name: 'Appeal', value: 'appeal' }
                ]
            },
            {
                name: 'description',
                description: 'Describe your issue',
                type: 3,
                required: true
            }
        ]
    },
    {
        name: 'close',
        description: 'Close a support ticket'
    },
    {
        name: 'info',
        description: 'Display server information embeds',
        options: [
            {
                name: 'type',
                description: 'Type of information to display',
                type: 3,
                required: true,
                choices: [
                    { name: 'Rules', value: 'rules' },
                    { name: 'Server Info', value: 'server' },
                    { name: 'Staff', value: 'staff' }
                ]
            }
        ]
    }
];

// Register slash commands
const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: moderationCommands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();

// Event handlers
client.once('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    
    // Start monitoring GitHub releases
    monitorGitHubReleases();
    
    // Set bot status
    client.user.setActivity('Support Tickets | /ticket', { type: 'WATCHING' });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options, user, guild, channel } = interaction;

    // Log command usage
    const args = options.data.map(opt => `${opt.name}: ${opt.value}`).join(', ');
    db.run(
        'INSERT INTO command_logs (command_name, user_id, username, channel_id, channel_name, guild_id, arguments) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [commandName, user.id, user.username, channel.id, channel.name, guild.id, args]
    );

    // Handle moderation commands
    switch (commandName) {
        case 'kick':
            await handleKick(interaction);
            break;
        case 'ban':
            await handleBan(interaction);
            break;
        case 'timeout':
            await handleTimeout(interaction);
            break;
        case 'unban':
            await handleUnban(interaction);
            break;
        case 'clear':
            await handleClear(interaction);
            break;
        case 'ticket':
            await handleTicket(interaction);
            break;
        case 'close':
            await handleCloseTicket(interaction);
            break;
        case 'info':
            await handleInfo(interaction);
            break;
    }
});

// Moderation command handlers
async function handleKick(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: 'You do not have permission to kick members.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) {
        return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    }

    if (!member.kickable) {
        return interaction.reply({ content: 'I cannot kick this user.', ephemeral: true });
    }

    try {
        await member.kick(reason);
        
        // Log the action
        db.run(
            'INSERT INTO mod_logs (action_type, moderator_id, moderator_name, target_id, target_name, reason, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['kick', interaction.user.id, interaction.user.username, user.id, user.username, reason, interaction.guild.id]
        );

        const embed = new EmbedBuilder()
            .setColor(0xFF6B35)
            .setTitle('Member Kicked')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        
        // Send to mod log channel if exists
        const modLogChannel = interaction.guild.channels.cache.find(ch => ch.name === 'mod-logs');
        if (modLogChannel) {
            await modLogChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'An error occurred while kicking the user.', ephemeral: true });
    }
}

async function handleBan(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: 'You do not have permission to ban members.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const deleteDays = interaction.options.getInteger('delete_days') || 0;

    try {
        await interaction.guild.members.ban(user, { deleteMessageDays: deleteDays, reason });
        
        // Log the action
        db.run(
            'INSERT INTO mod_logs (action_type, moderator_id, moderator_name, target_id, target_name, reason, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ['ban', interaction.user.id, interaction.user.username, user.id, user.username, reason, interaction.guild.id]
        );

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('Member Banned')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        
        // Send to mod log channel if exists
        const modLogChannel = interaction.guild.channels.cache.find(ch => ch.name === 'mod-logs');
        if (modLogChannel) {
            await modLogChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'An error occurred while banning the user.', ephemeral: true });
    }
}

async function handleTimeout(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: 'You do not have permission to timeout members.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const duration = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) {
        return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
    }

    try {
        const timeoutDuration = duration * 60 * 1000; // Convert minutes to milliseconds
        await member.timeout(timeoutDuration, reason);
        
        // Log the action
        db.run(
            'INSERT INTO mod_logs (action_type, moderator_id, moderator_name, target_id, target_name, reason, duration, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['timeout', interaction.user.id, interaction.user.username, user.id, user.username, reason, `${duration} minutes`, interaction.guild.id]
        );

        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('Member Timed Out')
            .addFields(
                { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                { name: 'Duration', value: `${duration} minutes`, inline: true },
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                { name: 'Reason', value: reason, inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        
        // Send to mod log channel if exists
        const modLogChannel = interaction.guild.channels.cache.find(ch => ch.name === 'mod-logs');
        if (modLogChannel) {
            await modLogChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'An error occurred while timing out the user.', ephemeral: true });
    }
}

async function handleUnban(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: 'You do not have permission to unban members.', ephemeral: true });
    }

    const userId = interaction.options.getString('user_id');

    try {
        await interaction.guild.members.unban(userId);
        
        // Log the action
        db.run(
            'INSERT INTO mod_logs (action_type, moderator_id, moderator_name, target_id, guild_id) VALUES (?, ?, ?, ?, ?)',
            ['unban', interaction.user.id, interaction.user.username, userId, interaction.guild.id]
        );

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('Member Unbanned')
            .addFields(
                { name: 'User ID', value: userId, inline: true },
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        
        // Send to mod log channel if exists
        const modLogChannel = interaction.guild.channels.cache.find(ch => ch.name === 'mod-logs');
        if (modLogChannel) {
            await modLogChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'An error occurred while unbanning the user. Make sure the user ID is valid and the user is banned.', ephemeral: true });
    }
}

async function handleClear(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ content: 'You do not have permission to manage messages.', ephemeral: true });
    }

    const amount = interaction.options.getInteger('amount');
    
    if (amount < 1 || amount > 100) {
        return interaction.reply({ content: 'Please provide a number between 1 and 100.', ephemeral: true });
    }

    try {
        const messages = await interaction.channel.bulkDelete(amount, true);
        
        // Log the action
        db.run(
            'INSERT INTO mod_logs (action_type, moderator_id, moderator_name, reason, guild_id) VALUES (?, ?, ?, ?, ?)',
            ['clear', interaction.user.id, interaction.user.username, `Cleared ${messages.size} messages`, interaction.guild.id]
        );

        await interaction.reply({ content: `Successfully deleted ${messages.size} messages.`, ephemeral: true });
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'An error occurred while clearing messages.', ephemeral: true });
    }
}

// Ticket system
async function handleTicket(interaction) {
    const category = interaction.options.getString('category');
    const description = interaction.options.getString('description');
    const user = interaction.user;
    
    // Check if user already has an open ticket
    db.get('SELECT * FROM tickets WHERE user_id = ? AND status = "open"', [user.id], async (err, row) => {
        if (row) {
            return interaction.reply({ content: 'You already have an open ticket!', ephemeral: true });
        }

        try {
            // Find or create support category
            let supportCategory = interaction.guild.channels.cache.find(ch => 
                ch.type === ChannelType.GuildCategory && ch.name.toLowerCase().includes('support')
            );
            
            if (!supportCategory) {
                supportCategory = await interaction.guild.channels.create({
                    name: '🎫 Support Tickets',
                    type: ChannelType.GuildCategory
                });
            }

            const ticketId = `ticket-${user.username}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
            
            // Create ticket channel
            const ticketChannel = await interaction.guild.channels.create({
                name: ticketId,
                type: ChannelType.GuildText,
                parent: supportCategory,
                permissionOverwrites: [
                    {
                        id: interaction.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                    },
                    // Add staff roles here
                ]
            });

            // Save ticket to database
            db.run(
                'INSERT INTO tickets (ticket_id, user_id, username, channel_id, category, status) VALUES (?, ?, ?, ?, ?, ?)',
                [ticketId, user.id, user.username, ticketChannel.id, category, 'open']
            );

            const ticketEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`Support Ticket - ${category}`)
                .setDescription(description)
                .addFields(
                    { name: 'Ticket ID', value: ticketId, inline: true },
                    { name: 'Category', value: category, inline: true },
                    { name: 'Status', value: 'Open', inline: true }
                )
                .setFooter({ text: `Created by ${user.username}`, iconURL: user.displayAvatarURL() })
                .setTimestamp();

            await ticketChannel.send({ content: `${user}, your support ticket has been created!`, embeds: [ticketEmbed] });
            
            await interaction.reply({ content: `Your ticket has been created: ${ticketChannel}`, ephemeral: true });
            
            // Start AI support if enabled
            if (process.env.OPENAI_API_KEY) {
                setTimeout(async () => {
                    const aiResponse = await generateAIResponse(description, category);
                    if (aiResponse) {
                        await ticketChannel.send({
                            embeds: [new EmbedBuilder()
                                .setColor(0x9B59B6)
                                .setTitle('🤖 AI Assistant')
                                .setDescription(aiResponse)
                                .setFooter({ text: 'This is an automated response. A staff member will assist you shortly.' })]
                        });
                    }
                }, 2000);
            }
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'An error occurred while creating the ticket.', ephemeral: true });
        }
    });
}

async function handleCloseTicket(interaction) {
    const channel = interaction.channel;
    
    // Check if this is a ticket channel
    db.get('SELECT * FROM tickets WHERE channel_id = ? AND status = "open"', [channel.id], async (err, ticket) => {
        if (!ticket) {
            return interaction.reply({ content: 'This is not an open ticket channel.', ephemeral: true });
        }

        try {
            // Generate transcript
            const messages = await channel.messages.fetch({ limit: 100 });
            const transcript = messages.reverse().map(msg => 
                `[${msg.createdAt.toISOString()}] ${msg.author.username}: ${msg.content}`
            ).join('\n');

            // Update ticket in database
            db.run(
                'UPDATE tickets SET status = "closed", closed_at = CURRENT_TIMESTAMP, closed_by = ?, transcript = ? WHERE id = ?',
                [interaction.user.id, transcript, ticket.id]
            );

            const closeEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Ticket Closed')
                .setDescription(`This ticket has been closed by ${interaction.user.username}`)
                .setTimestamp();

            await interaction.reply({ embeds: [closeEmbed] });
            
            // Wait a bit then delete the channel
            setTimeout(async () => {
                await channel.delete();
            }, 5000);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'An error occurred while closing the ticket.', ephemeral: true });
        }
    });
}

// AI Support function
async function generateAIResponse(description, category) {
    if (!process.env.OPENAI_API_KEY) return null;
    
    try {
        const prompt = `You are a helpful support assistant for a Discord server. A user has created a ${category} ticket with this description: "${description}". Provide a helpful initial response that acknowledges their issue and offers some preliminary assistance or guidance. Keep it concise and friendly.`;
        
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 200
        });
        
        return response.choices[0].message.content;
    } catch (error) {
        console.error('AI Response Error:', error);
        return null;
    }
}

// Information embeds
async function handleInfo(interaction) {
    const type = interaction.options.getString('type');
    
    let embed;
    
    switch (type) {
        case 'rules':
            embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📋 Server Rules')
                .setDescription('Please follow these rules to maintain a positive community environment:')
                .addFields(
                    { name: '1. Be Respectful', value: 'Treat all members with respect and kindness.', inline: false },
                    { name: '2. No Spam', value: 'Avoid flooding channels with repetitive messages.', inline: false },
                    { name: '3. Stay On Topic', value: 'Keep discussions relevant to the channel topic.', inline: false },
                    { name: '4. No NSFW Content', value: 'Keep all content appropriate for all ages.', inline: false },
                    { name: '5. Follow Discord ToS', value: 'All Discord Terms of Service apply.', inline: false }
                )
                .setFooter({ text: 'Violations may result in warnings, timeouts, or bans.' });
            break;
        case 'server':
            embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('🖥️ Server Information')
                .addFields(
                    { name: 'Members', value: `${interaction.guild.memberCount}`, inline: true },
                    { name: 'Channels', value: `${interaction.guild.channels.cache.size}`, inline: true },
                    { name: 'Roles', value: `${interaction.guild.roles.cache.size}`, inline: true },
                    { name: 'Created', value: `<t:${Math.floor(interaction.guild.createdTimestamp / 1000)}:F>`, inline: false }
                )
                .setThumbnail(interaction.guild.iconURL());
            break;
        case 'staff':
            const staffRoles = interaction.guild.roles.cache.filter(role => 
                role.permissions.has(PermissionFlagsBits.KickMembers) || 
                role.permissions.has(PermissionFlagsBits.BanMembers)
            );
            
            embed = new EmbedBuilder()
                .setColor(0xFF6B35)
                .setTitle('👮 Staff Team')
                .setDescription('Our dedicated staff team is here to help!')
                .addFields(
                    staffRoles.map(role => ({
                        name: role.name,
                        value: `${role.members.size} members`,
                        inline: true
                    }))
                );
            break;
    }
    
    await interaction.reply({ embeds: [embed] });
}

// GitHub release monitoring
async function monitorGitHubReleases() {
    if (!process.env.GITHUB_REPO || !process.env.GITHUB_TOKEN) return;
    
    const [owner, repo] = process.env.GITHUB_REPO.split('/');
    
    setInterval(async () => {
        try {
            const { data: releases } = await octokit.rest.repos.listReleases({
                owner,
                repo,
                per_page: 1
            });
            
            if (releases.length > 0) {
                const latestRelease = releases[0];
                
                // Check if we've already announced this release
                const lastAnnouncedFile = './last_announced_release.txt';
                const fs = require('fs');
                
                let lastAnnounced = '';
                try {
                    lastAnnounced = fs.readFileSync(lastAnnouncedFile, 'utf8').trim();
                } catch (err) {
                    // File doesn't exist, that's okay
                }
                
                if (lastAnnounced !== latestRelease.tag_name) {
                    // Find changelog channel
                    const changelogChannel = client.channels.cache.find(ch => 
                        ch.name.toLowerCase().includes('changelog') || 
                        ch.name.toLowerCase().includes('updates')
                    );
                    
                    if (changelogChannel) {
                        const releaseEmbed = new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle(`🚀 New Release: ${latestRelease.name || latestRelease.tag_name}`)
                            .setDescription(latestRelease.body || 'No description provided.')
                            .addFields(
                                { name: 'Version', value: latestRelease.tag_name, inline: true },
                                { name: 'Release Date', value: new Date(latestRelease.published_at).toLocaleString(), inline: true }
                            )
                            .setURL(latestRelease.html_url)
                            .setTimestamp();
                        
                        await changelogChannel.send({ embeds: [releaseEmbed] });
                        
                        // Update last announced release
                        fs.writeFileSync(lastAnnouncedFile, latestRelease.tag_name);
                    }
                }
            }
        } catch (error) {
            console.error('Error checking GitHub releases:', error);
        }
    }, 5 * 60 * 1000); // Check every 5 minutes
}

// AutoMod system
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    
    // Get automod settings for this guild
    db.get('SELECT * FROM automod_settings WHERE guild_id = ?', [message.guild.id], async (err, settings) => {
        if (!settings) return;
        
        let shouldDelete = false;
        let reason = '';
        
        // Spam detection
        if (settings.spam_detection) {
            const userMessages = message.channel.messages.cache.filter(m => 
                m.author.id === message.author.id && 
                Date.now() - m.createdTimestamp < settings.time_window * 1000
            );
            
            if (userMessages.size > settings.max_messages) {
                shouldDelete = true;
                reason = 'Spam detection';
            }
        }
        
        // Profanity filter
        if (settings.profanity_filter) {
            const profanityWords = ['badword1', 'badword2', 'badword3']; // Add your profanity list
            const messageContent = message.content.toLowerCase();
            const hasProfanity = profanityWords.some(word => messageContent.includes(word));
            
            if (hasProfanity) {
                shouldDelete = true;
                reason = 'Profanity detected';
            }
        }
        
        // Link filter
        if (settings.link_filter) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            if (urlRegex.test(message.content)) {
                // Allow certain domains if needed
                const allowedDomains = ['discord.gg', 'github.com', 'youtube.com'];
                const hasAllowedDomain = allowedDomains.some(domain => message.content.includes(domain));
                
                if (!hasAllowedDomain) {
                    shouldDelete = true;
                    reason = 'Unauthorized link';
                }
            }
        }
        
        // Mention spam
        if (message.mentions.users.size > settings.max_mentions) {
            shouldDelete = true;
            reason = 'Excessive mentions';
        }
        
        // Delete message and log if needed
        if (shouldDelete) {
            try {
                await message.delete();
                
                // Log the deletion
                db.run(
                    'INSERT INTO mod_logs (action_type, moderator_id, moderator_name, target_id, target_name, reason, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    ['automod_delete', client.user.id, 'AutoMod', message.author.id, message.author.username, reason, message.guild.id]
                );
                
                // Send warning to user
                const warningEmbed = new EmbedBuilder()
                    .setColor(0xFF6B35)
                    .setTitle('⚠️ Message Deleted')
                    .setDescription(`Your message was deleted by AutoMod: ${reason}`)
                    .setTimestamp();
                
                await message.author.send({ embeds: [warningEmbed] }).catch(() => {});
                
                // Log to mod channel
                const modLogChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
                if (modLogChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor(0xFF6B35)
                        .setTitle('AutoMod Action')
                        .addFields(
                            { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
                            { name: 'Channel', value: `${message.channel}`, inline: true },
                            { name: 'Reason', value: reason, inline: true },
                            { name: 'Content', value: message.content.substring(0, 1000) || 'No content', inline: false }
                        )
                        .setTimestamp();
                    
                    await modLogChannel.send({ embeds: [logEmbed] });
                }
            } catch (error) {
                console.error('AutoMod Error:', error);
            }
        }
    });
});

// Message delete logging
client.on('messageDelete', async message => {
    if (message.author?.bot || !message.guild) return;
    
    // Log deleted message
    db.run(
        'INSERT INTO mod_logs (action_type, target_id, target_name, reason, guild_id) VALUES (?, ?, ?, ?, ?)',
        ['message_delete', message.author.id, message.author.username, message.content.substring(0, 500), message.guild.id]
    );
    
    const modLogChannel = message.guild.channels.cache.find(ch => ch.name === 'mod-logs');
    if (modLogChannel) {
        const embed = new EmbedBuilder()
            .setColor(0xFF6B35)
            .setTitle('Message Deleted')
            .addFields(
                { name: 'User', value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: 'Channel', value: `${message.channel}`, inline: true },
                { name: 'Content', value: message.content.substring(0, 1000) || 'No content', inline: false }
            )
            .setTimestamp();
        
        await modLogChannel.send({ embeds: [embed] });
    }
});

// Message edit logging
client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (newMessage.author?.bot || !newMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;
    
    const modLogChannel = newMessage.guild.channels.cache.find(ch => ch.name === 'mod-logs');
    if (modLogChannel) {
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('Message Edited')
            .addFields(
                { name: 'User', value: `${newMessage.author.tag} (${newMessage.author.id})`, inline: true },
                { name: 'Channel', value: `${newMessage.channel}`, inline: true },
                { name: 'Before', value: oldMessage.content.substring(0, 500) || 'No content', inline: false },
                { name: 'After', value: newMessage.content.substring(0, 500) || 'No content', inline: false }
            )
            .setTimestamp();
        
        await modLogChannel.send({ embeds: [embed] });
    }
});

// AI Support in ticket channels
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;
    
    // Check if this is a ticket channel
    db.get('SELECT * FROM tickets WHERE channel_id = ? AND status = "open"', [message.channel.id], async (err, ticket) => {
        if (!ticket || !process.env.OPENAI_API_KEY) return;
        
        // Only respond to user messages, not staff
        if (message.member.permissions.has(PermissionFlagsBits.KickMembers)) return;
        
        try {
            // Get recent conversation context
            const recentMessages = await message.channel.messages.fetch({ limit: 10 });
            const context = recentMessages.reverse()
                .filter(msg => !msg.author.bot || msg.author.id === client.user.id)
                .map(msg => `${msg.author.username}: ${msg.content}`)
                .join('\n');
            
            const prompt = `You are an AI support assistant for a Discord server. Here's the recent conversation in this support ticket:

${context}

Provide a helpful response to assist the user. If the issue seems complex or requires human intervention, suggest they wait for a staff member. Keep responses concise and helpful.`;
            
            const response = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 300
            });
            
            const aiResponse = response.choices[0].message.content;
            
            // Send AI response with a delay to seem more natural
            setTimeout(async () => {
                await message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor(0x9B59B6)
                        .setTitle('🤖 AI Assistant')
                        .setDescription(aiResponse)
                        .setFooter({ text: 'AI Response • A staff member will assist you if needed' })]
                });
            }, 2000 + Math.random() * 3000); // Random delay between 2-5 seconds
            
        } catch (error) {
            console.error('AI Support Error:', error);
        }
    });
});

// Initialize Express server for web panel
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Web panel routes
app.get('/', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    db.get('SELECT * FROM panel_users WHERE username = ?', [username], async (err, user) => {
        if (user && await bcrypt.compare(password, user.password_hash)) {
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;
            res.redirect('/');
        } else {
            res.redirect('/login?error=invalid');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// API endpoints
app.get('/api/tickets', requireAuth, (req, res) => {
    const query = `
        SELECT t.*, 
               CASE 
                   WHEN t.status = 'open' THEN 'Open'
                   WHEN t.status = 'closed' THEN 'Closed'
                   ELSE 'Unknown'
               END as status_display
        FROM tickets t 
        ORDER BY t.created_at DESC 
        LIMIT 100
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.get('/api/mod-logs', requireAuth, (req, res) => {
    db.all('SELECT * FROM mod_logs ORDER BY timestamp DESC LIMIT 100', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.get('/api/command-logs', requireAuth, (req, res) => {
    db.all('SELECT * FROM command_logs ORDER BY timestamp DESC LIMIT 100', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.get('/api/arma3-logs', requireAuth, (req, res) => {
    db.all('SELECT * FROM arma3_logs ORDER BY timestamp DESC LIMIT 100', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.post('/api/arma3-log', (req, res) => {
    const { event_type, player_name, player_id, target_name, target_id, weapon, money_amount, distance, server_name, auth_token } = req.body;
    
    // Verify auth token
    if (auth_token !== process.env.ARMA3_AUTH_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    db.run(
        'INSERT INTO arma3_logs (event_type, player_name, player_id, target_name, target_id, weapon, money_amount, distance, server_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [event_type, player_name, player_id, target_name, target_id, weapon, money_amount, distance, server_name],
        function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
            } else {
                res.json({ success: true, id: this.lastID });
            }
        }
    );
});

// Start the web server
app.listen(PORT, () => {
    console.log(`Web panel running on port ${PORT}`);
});

// Start Discord bot
client.login(process.env.DISCORD_TOKEN);