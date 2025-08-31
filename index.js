const { Client, GatewayIntentBits, Collection, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
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

// MySQL connection pool
const dbPool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+00:00'
});

// Initialize OpenAI for AI support
let openai = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    });
}

// Initialize GitHub API
let octokit = null;
if (process.env.GITHUB_TOKEN) {
    octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });
}

// Database helper functions
async function query(sql, params = []) {
    const connection = await dbPool.getConnection();
    try {
        const [results] = await connection.execute(sql, params);
        return results;
    } finally {
        connection.release();
    }
}

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
    
    // Test database connection
    try {
        await dbPool.getConnection();
        console.log('✅ MySQL database connected successfully!');
        
        // Initialize admin user if it doesn't exist
        if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
            await initializeAdminUser();
        }
    } catch (error) {
        console.error('❌ MySQL connection failed:', error);
        process.exit(1);
    }
    
    // Start monitoring GitHub releases
    if (octokit && process.env.GITHUB_REPO) {
        monitorGitHubReleases();
    }
    
    // Set bot status
    client.user.setActivity('Support Tickets | /ticket', { type: 'WATCHING' });
});

async function initializeAdminUser() {
    try {
        const existingUser = await query('SELECT id FROM panel_users WHERE username = ?', [process.env.ADMIN_USERNAME]);
        
        if (existingUser.length === 0) {
            const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
            await query(
                'INSERT INTO panel_users (username, password_hash, role) VALUES (?, ?, ?)',
                [process.env.ADMIN_USERNAME, passwordHash, 'admin']
            );
            console.log('✅ Admin user created successfully!');
        }
    } catch (error) {
        console.error('Error initializing admin user:', error);
    }
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName, options, user, guild, channel } = interaction;

    // Log command usage
    const args = options.data.map(opt => `${opt.name}: ${opt.value}`).join(', ');
    await query(
        'INSERT INTO command_logs (command_name, user_id, username, channel_i