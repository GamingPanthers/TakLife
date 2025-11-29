// Enhanced API endpoints - Complete implementation

// Embed Management API Endpoints
app.get('/api/embeds', requireAuth, async (req, res) => {
    try {
        const embeds = await query(`
            SELECT id, name, title, description, color, author_name, footer_text, 
                   image_url, thumbnail_url, fields, created_by, created_at 
            FROM server_embeds 
            WHERE guild_id = ? 
            ORDER BY created_at DESC
        `, [process.env.GUILD_ID || 'default']);
        
        res.json(embeds);
    } catch (error) {
        console.error('Get embeds error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/embeds/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const embeds = await query(
            'SELECT * FROM server_embeds WHERE id = ? AND guild_id = ?',
            [id, process.env.GUILD_ID || 'default']
        );
        
        if (embeds.length === 0) {
            return res.status(404).json({ error: 'Embed not found' });
        }
        
        res.json(embeds[0]);
    } catch (error) {
        console.error('Get embed error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/embeds', requireAuth, async (req, res) => {
    try {
        const {
            name, title, description, color, author_name, author_icon,
            footer_text, footer_icon, image_url, thumbnail_url, fields
        } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'Embed name is required' });
        }
        
        // Check if embed name already exists
        const existing = await query(
            'SELECT id FROM server_embeds WHERE name = ? AND guild_id = ?',
            [name, process.env.GUILD_ID || 'default']
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Embed name already exists' });
        }
        
        const result = await query(`
            INSERT INTO server_embeds 
            (name, title, description, color, author_name, author_icon, footer_text, 
             footer_icon, image_url, thumbnail_url, fields, guild_id, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name, title || null, description || null, color || 255,
            author_name || null, author_icon || null, footer_text || null,
            footer_icon || null, image_url || null, thumbnail_url || null,
            JSON.stringify(fields || []), process.env.GUILD_ID || 'default',
            req.session.username
        ]);
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Create embed error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/embeds/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, title, description, color, author_name, author_icon,
            footer_text, footer_icon, image_url, thumbnail_url, fields
        } = req.body;
        
        const result = await query(`
            UPDATE server_embeds 
            SET name = ?, title = ?, description = ?, color = ?, author_name = ?, 
                author_icon = ?, footer_text = ?, footer_icon = ?, image_url = ?, 
                thumbnail_url = ?, fields = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND guild_id = ?
        `, [
            name, title || null, description || null, color || 255,
            author_name || null, author_icon || null, footer_text || null,
            footer_icon || null, image_url || null, thumbnail_url || null,
            JSON.stringify(fields || []), id, process.env.GUILD_ID || 'default'
        ]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Embed not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Update embed error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/embeds/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'DELETE FROM server_embeds WHERE id = ? AND guild_id = ?',
            [id, process.env.GUILD_ID || 'default']
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Embed not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete embed error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Enhanced send embed endpoint
app.post('/api/send-embed', requireAuth, async (req, res) => {
    const { embedId, channelId, customEmbed } = req.body;
    
    if (!channelId) {
        return res.status(400).json({ error: 'Channel ID is required' });
    }
    
    try {
        const channel = client.channels.cache.get(channelId);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }
        
        let embed;
        
        if (embedId) {
            // Use saved embed template
            const embeds = await query(
                'SELECT * FROM server_embeds WHERE id = ? AND guild_id = ?',
                [embedId, process.env.GUILD_ID || 'default']
            );
            
            if (embeds.length === 0) {
                return res.status(404).json({ error: 'Embed template not found' });
            }
            
            const template = embeds[0];
            embed = new EmbedBuilder();
            
            // Build embed from template
            if (template.title) embed.setTitle(template.title);
            if (template.description) embed.setDescription(template.description);
            if (template.color) embed.setColor(template.color);
            if (template.author_name) embed.setAuthor({ 
                name: template.author_name,
                iconURL: template.author_icon || undefined
            });
            if (template.footer_text) embed.setFooter({ 
                text: template.footer_text,
                iconURL: template.footer_icon || undefined
            });
            if (template.image_url) embed.setImage(template.image_url);
            if (template.thumbnail_url) embed.setThumbnail(template.thumbnail_url);
            
            // Add fields if they exist
            if (template.fields) {
                try {
                    const fields = JSON.parse(template.fields);
                    fields.forEach(field => {
                        embed.addFields({
                            name: field.name,
                            value: field.value,
                            inline: field.inline || false
                        });
                    });
                } catch (parseError) {
                    console.error('Error parsing embed fields:', parseError);
                }
            }
            
            embed.setTimestamp();
            
        } else if (customEmbed) {
            // Use custom embed data from request
            embed = new EmbedBuilder();
            
            if (customEmbed.title) embed.setTitle(customEmbed.title);
            if (customEmbed.description) embed.setDescription(customEmbed.description);
            if (customEmbed.color) embed.setColor(customEmbed.color);
            if (customEmbed.author) embed.setAuthor({ name: customEmbed.author });
            if (customEmbed.footer) embed.setFooter({ text: customEmbed.footer });
            if (customEmbed.image) embed.setImage(customEmbed.image);
            if (customEmbed.thumbnail) embed.setThumbnail(customEmbed.thumbnail);
            
            embed.setTimestamp();
        } else {
            return res.status(400).json({ error: 'Either embedId or customEmbed is required' });
        }
        
        await channel.send({ embeds: [embed] });
        
        // Log the action
        await query(
            'INSERT INTO command_logs (command_name, user_id, username, channel_id, channel_name, guild_id, arguments, response) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            ['send_embed_web', req.session.userId || 'web', req.session.username, channelId, channel.name, channel.guild.id, JSON.stringify(req.body), 'Embed sent successfully']
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Send embed error:', error);
        res.status(500).json({ error: 'Failed to send embed' });
    }
});

// Welcome/Leave/Verification Settings API
app.get('/api/welcome-settings', requireAuth, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        const settings = await query(
            'SELECT * FROM welcome_settings WHERE guild_id = ?',
            [guildId]
        );
        
        if (settings.length > 0) {
            res.json(settings[0]);
        } else {
            // Return default settings
            res.json({
                guild_id: guildId,
                welcome_enabled: false,
                welcome_channel_id: null,
                welcome_message: 'Welcome to {server}, {user}! We now have {membercount} members!',
                welcome_embed_id: null,
                leave_enabled: false,
                leave_channel_id: null,
                leave_message: '{username} has left {server}. We now have {membercount} members.',
                leave_embed_id: null,
                verification_enabled: false,
                verification_channel_id: null,
                verification_role_id: null,
                verification_message: 'Please react with ✅ to verify and gain access to the server.',
                verification_message_id: null
            });
        }
    } catch (error) {
        console.error('Get welcome settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/welcome-settings', requireAuth, async (req, res) => {
    try {
        const {
            welcome_enabled, welcome_channel_id, welcome_message, welcome_embed_id,
            leave_enabled, leave_channel_id, leave_message, leave_embed_id,
            verification_enabled, verification_channel_id, verification_role_id, verification_message
        } = req.body;
        
        const guildId = process.env.GUILD_ID || 'default';
        
        await query(`
            INSERT INTO welcome_settings 
            (guild_id, welcome_enabled, welcome_channel_id, welcome_message, welcome_embed_id,
             leave_enabled, leave_channel_id, leave_message, leave_embed_id,
             verification_enabled, verification_channel_id, verification_role_id, verification_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                welcome_enabled = VALUES(welcome_enabled),
                welcome_channel_id = VALUES(welcome_channel_id),
                welcome_message = VALUES(welcome_message),
                welcome_embed_id = VALUES(welcome_embed_id),
                leave_enabled = VALUES(leave_enabled),
                leave_channel_id = VALUES(leave_channel_id),
                leave_message = VALUES(leave_message),
                leave_embed_id = VALUES(leave_embed_id),
                verification_enabled = VALUES(verification_enabled),
                verification_channel_id = VALUES(verification_channel_id),
                verification_role_id = VALUES(verification_role_id),
                verification_message = VALUES(verification_message),
                updated_at = CURRENT_TIMESTAMP
        `, [
            guildId, welcome_enabled, welcome_channel_id || null, welcome_message || null, welcome_embed_id || null,
            leave_enabled, leave_channel_id || null, leave_message || null, leave_embed_id || null,
            verification_enabled, verification_channel_id || null, verification_role_id || null, verification_message || null
        ]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Save welcome settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Test welcome/leave messages
app.post('/api/test-welcome', requireAuth, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        const settings = await query(
            'SELECT * FROM welcome_settings WHERE guild_id = ? AND welcome_enabled = 1',
            [guildId]
        );
        
        if (settings.length === 0 || !settings[0].welcome_channel_id) {
            return res.status(400).json({ error: 'Welcome messages not configured or enabled' });
        }
        
        const setting = settings[0];
        const channel = client.channels.cache.get(setting.welcome_channel_id);
        if (!channel) {
            return res.status(404).json({ error: 'Welcome channel not found' });
        }
        
        const guild = client.guilds.cache.get(guildId);
        let message = setting.welcome_message || 'Welcome to {server}, {user}!';
        
        // Replace placeholders for test
        message = message
            .replace(/{user}/g, `<@${req.session.userId}>`)
            .replace(/{username}/g, req.session.username)
            .replace(/{server}/g, guild?.name || 'Test Server')
            .replace(/{membercount}/g, guild?.memberCount?.toString() || '100');
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🧪 Test Welcome Message')
            .setDescription(message)
            .setFooter({ text: 'This is a test message sent from the web panel' })
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        res.json({ success: true });
    } catch (error) {
        console.error('Test welcome error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/test-leave', requireAuth, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        const settings = await query(
            'SELECT * FROM welcome_settings WHERE guild_id = ? AND leave_enabled = 1',
            [guildId]
        );
        
        if (settings.length === 0 || !settings[0].leave_channel_id) {
            return res.status(400).json({ error: 'Leave messages not configured or enabled' });
        }
        
        const setting = settings[0];
        const channel = client.channels.cache.get(setting.leave_channel_id);
        if (!channel) {
            return res.status(404).json({ error: 'Leave channel not found' });
        }
        
        const guild = client.guilds.cache.get(guildId);
        let message = setting.leave_message || '{username} has left {server}.';
        
        // Replace placeholders for test
        message = message
            .replace(/{user}/g, `<@${req.session.userId}>`)
            .replace(/{username}/g, req.session.username)
            .replace(/{server}/g, guild?.name || 'Test Server')
            .replace(/{membercount}/g, guild?.memberCount?.toString() || '100');
        
        const embed = new EmbedBuilder()
            .setColor(0xFF6600)
            .setTitle('🧪 Test Leave Message')
            .setDescription(message)
            .setFooter({ text: 'This is a test message sent from the web panel' })
            .setTimestamp();
        
        await channel.send({ embeds: [embed] });
        res.json({ success: true });
    } catch (error) {
        console.error('Test leave error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create verification message endpoint
app.post('/api/create-verification', requireAuth, async (req, res) => {
    try {
        const { channel_id, message } = req.body;
        
        if (!channel_id) {
            return res.status(400).json({ error: 'Channel ID is required' });
        }
        
        const channel = client.channels.cache.get(channel_id);
        if (!channel) {
            return res.status(404).json({ error: 'Channel not found' });
        }
        
        const verifyEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🔐 Server Verification')
            .setDescription(message || 'Welcome to the server! To gain full access, please react with ✅ below.')
            .addFields(
                { name: '📋 Instructions', value: '1. Read the server rules\n2. React with ✅ to this message\n3. You will receive your verified role automatically' },
                { name: '❓ Need Help?', value: 'Contact a staff member if you have questions.' }
            )
            .setFooter({ text: 'This verification helps keep our community safe' })
            .setTimestamp();
        
        const verificationMessage = await channel.send({ embeds: [verifyEmbed] });
        await verificationMessage.react('✅');
        
        // Update settings with message ID
        await query(
            'UPDATE welcome_settings SET verification_message_id = ? WHERE guild_id = ?',
            [verificationMessage.id, process.env.GUILD_ID || 'default']
        );
        
        res.json({ 
            success: true, 
            message_id: verificationMessage.id,
            channel_name: channel.name
        });
    } catch (error) {
        console.error('Create verification error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API endpoints for existing functionality
app.get('/api/tickets', requireAuth, async (req, res) => {
    try {
        const tickets = await query(`
            SELECT *, 
                   CASE 
                       WHEN status = 'open' THEN 'Open'
                       WHEN status = 'closed' THEN 'Closed'
                       ELSE 'Unknown'
                   END as status_display
            FROM tickets 
            ORDER BY created_at DESC 
            LIMIT 100
        `);
        res.json(tickets);
    } catch (error) {
        console.error('Get tickets error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/mod-logs', requireAuth, async (req, res) => {
    try {
        const logs = await query('SELECT * FROM mod_logs ORDER BY timestamp DESC LIMIT 100');
        res.json(logs);
    } catch (error) {
        console.error('Get mod logs error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/command-logs', requireAuth, async (req, res) => {
    try {
        const logs = await query('SELECT * FROM command_logs ORDER BY timestamp DESC LIMIT 100');
        res.json(logs);
    } catch (error) {
        console.error('Get command logs error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/arma3-logs', requireAuth, async (req, res) => {
    try {
        const logs = await query('SELECT * FROM arma3_logs ORDER BY timestamp DESC LIMIT 100');
        res.json(logs);
    } catch (error) {
        console.error('Get arma3 logs error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/arma3-log', async (req, res) => {
    const { event_type, player_name, player_id, target_name, target_id, weapon, money_amount, distance, server_name, auth_token, additional_data } = req.body;
    
    // Verify auth token
    if (auth_token !== process.env.ARMA3_AUTH_TOKEN) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const result = await query(
            'INSERT INTO arma3_logs (event_type, player_name, player_id, target_name, target_id, weapon, money_amount, distance, server_name, additional_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [event_type, player_name, player_id, target_name, target_id, weapon, money_amount, distance, server_name, JSON.stringify(additional_data)]
        );
        
        res.json({ success: true, id: result.insertId });
    } catch (error) {
        console.error('Insert arma3 log error:', error);
        res.status(500).json({ error: error.message });
    }
});

// AutoMod settings endpoints
app.post('/api/automod-settings', requireAuth, async (req, res) => {
    const { spam_detection, profanity_filter, link_filter, max_mentions } = req.body;
    const guildId = process.env.GUILD_ID;
    
    if (!guildId) {
        return res.status(400).json({ error: 'Guild ID not configured' });
    }
    
    try {
        await query(
            'INSERT INTO automod_settings (guild_id, spam_detection, profanity_filter, link_filter, max_mentions) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE spam_detection = VALUES(spam_detection), profanity_filter = VALUES(profanity_filter), link_filter = VALUES(link_filter), max_mentions = VALUES(max_mentions)',
            [guildId, spam_detection, profanity_filter, link_filter, max_mentions]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('AutoMod settings error:', error);
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

app.get('/api/automod-settings', requireAuth, async (req, res) => {
    const guildId = process.env.GUILD_ID;
    
    if (!guildId) {
        return res.status(400).json({ error: 'Guild ID not configured' });
    }
    
    try {
        const settings = await query('SELECT * FROM automod_settings WHERE guild_id = ?', [guildId]);
        
        if (settings.length > 0) {
            res.json(settings[0]);
        } else {
            res.json({
                spam_detection: true,
                profanity_filter: true,
                link_filter: false,
                max_mentions: 5,
                max_messages: 10,
                time_window: 10
            });
        }
    } catch (error) {
        console.error('Get AutoMod settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get bot statistics endpoint
app.get('/api/bot-stats', requireAuth, async (req, res) => {
    try {
        const stats = {
            guilds: client.guilds.cache.size,
            users: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
            channels: client.channels.cache.size,
            uptime: Math.floor(client.uptime / 1000),
            ping: client.ws.ping,
            memoryUsage: process.memoryUsage(),
            nodeVersion: process.version,
            discordJsVersion: require('discord.js').version
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Bot stats error:', error);
        res.status(500).json({ error: 'Failed to get bot statistics' });
    }
});

// Member statistics endpoint
app.get('/api/member-stats', requireAuth, async (req, res) => {
    try {
        const guildId = process.env.GUILD_ID || 'default';
        const stats = await query(`
            SELECT 
                action_type,
                COUNT(*) as count,
                DATE(timestamp) as date
            FROM member_logs 
            WHERE guild_id = ? 
            AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY action_type, DATE(timestamp)
            ORDER BY date DESC
        `, [guildId]);
        
        const today = new Date();
        const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
        
        const recentJoins = await query(
            'SELECT COUNT(*) as count FROM member_logs WHERE guild_id = ? AND action_type = "join" AND timestamp >= ?',
            [guildId, thirtyDaysAgo]
        );
        
        const recentLeaves = await query(
            'SELECT COUNT(*) as count FROM member_logs WHERE guild_id = ? AND action_type = "leave" AND timestamp >= ?',
            [guildId, thirtyDaysAgo]
        );
        
        const recentVerifications = await query(
            'SELECT COUNT(*) as count FROM member_logs WHERE guild_id = ? AND action_type = "verify" AND timestamp >= ?',
            [guildId, thirtyDaysAgo]
        );
        
        res.json({
            daily_stats: stats,
            summary: {
                joins_30_days: recentJoins[0]?.count || 0,
                leaves_30_days: recentLeaves[0]?.count || 0,
                verifications_30_days: recentVerifications[0]?.count || 0,
                net_growth: (recentJoins[0]?.count || 0) - (recentLeaves[0]?.count || 0)
            }
        });
    } catch (error) {
        console.error('Member stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Close ticket endpoint
app.post('/api/close-ticket/:ticketId', requireAuth, async (req, res) => {
    const { ticketId } = req.params;
    const { reason } = req.body;
    
    try {
        const tickets = await query('SELECT * FROM tickets WHERE ticket_id = ? AND status = "open"', [ticketId]);
        
        if (tickets.length === 0) {
            return res.status(404).json({ error: 'Ticket not found or already closed' });
        }
        
        const ticket = tickets[0];
        
        // Get channel and close it
        const channel = client.channels.cache.get(ticket.channel_id);
        if (channel) {
            // Send closing message
            const closeEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('Ticket Closed')
                .setDescription(`This ticket has been closed by ${req.session.username}`)
                .addFields(
                    { name: 'Reason', value: reason || 'No reason provided', inline: false }
                )
                .setTimestamp();
            
            await channel.send({ embeds: [closeEmbed] });
            
            // Delete channel after delay
            setTimeout(async () => {
                try {
                    await channel.delete();
                } catch (deleteError) {
                    console.error('Error deleting ticket channel:', deleteError);
                }
            }, 10000);
        }
        
        // Update ticket in database
        await query(
            'UPDATE tickets SET status = "closed", closed_at = NOW(), closed_by = ? WHERE ticket_id = ?',
            [req.session.username, ticketId]
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Close ticket error:', error);
        res.status(500).json({ error: 'Failed to close ticket' });
    }
});

// Get ticket transcript endpoint
app.get('/api/ticket-transcript/:ticketId', requireAuth, async (req, res) => {
    const { ticketId } = req.params;
    
    try {
        const tickets = await query('SELECT transcript FROM tickets WHERE ticket_id = ?', [ticketId]);
        
        if (tickets.length === 0) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        
        res.json({ transcript: tickets[0].transcript || 'No transcript available' });
    } catch (error) {
        console.error('Get transcript error:', error);
        res.status(500).json({ error: 'Failed to get transcript' });
    }
});

// Create manual ticket endpoint
app.post('/api/create-ticket', requireAuth, async (req, res) => {
    const { userId, category, description, priority } = req.body;
    
    if (!userId || !category || !description) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
        const guild = client.guilds.cache.get(process.env.GUILD_ID);
        if (!guild) {
            return res.status(500).json({ error: 'Guild not found' });
        }
        
        const user = await client.users.fetch(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Find or create support category
        let supportCategory = guild.channels.cache.find(ch => 
            ch.type === ChannelType.GuildCategory && ch.name.toLowerCase().includes('support')
        );
        
        if (!supportCategory) {
            supportCategory = await guild.channels.create({
                name: '🎫 Support Tickets',
                type: ChannelType.GuildCategory
            });
        }
        
        const ticketId = `ticket-${user.username}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
        
        // Create ticket channel
        const ticketChannel = await guild.channels.create({
            name: ticketId,
            type: ChannelType.GuildText,
            parent: supportCategory,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                }
            ]
        });
        
        // Save ticket to database
        const result = await query(
            'INSERT INTO tickets (ticket_id, user_id, username, channel_id, category, priority, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [ticketId, user.id, user.username, ticketChannel.id, category, priority || 'medium', 'open']
        );
        
        const ticketEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Support Ticket - ${category}`)
            .setDescription(description)
            .addFields(
                { name: 'Ticket ID', value: ticketId, inline: true },
                { name: 'Category', value: category, inline: true },
                { name: 'Priority', value: priority || 'Medium', inline: true },
                { name: 'Created by', value: `${req.session.username} (Staff)`, inline: true }
            )
            .setFooter({ text: `For user: ${user.username}`, iconURL: user.displayAvatarURL() })
            .setTimestamp();
        
        await ticketChannel.send({ content: `${user}, a support ticket has been created for you!`, embeds: [ticketEmbed] });
        
        res.json({ 
            success: true, 
            ticketId, 
            channelId: ticketChannel.id,
            id: result.insertId
        });
    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
});

// Export user data endpoint (GDPR compliance)
app.get('/api/export-user-data/:userId', requireAuth, async (req, res) => {
    const { userId } = req.params;
    
    if (req.session.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const userData = {
            tickets: await query('SELECT * FROM tickets WHERE user_id = ?', [userId]),
            commands: await query('SELECT * FROM command_logs WHERE user_id = ?', [userId]),
            moderation: await query('SELECT * FROM mod_logs WHERE target_id = ?', [userId]),
            arma3: await query('SELECT * FROM arma3_logs WHERE player_id = ?', [userId]),
            member_activity: await query('SELECT * FROM member_logs WHERE user_id = ?', [userId])
        };
        
        res.json(userData);
    } catch (error) {
        console.error('Export user data error:', error);
        res.status(500).json({ error: 'Failed to export user data' });
    }
});

// Delete user data endpoint (GDPR compliance)
app.delete('/api/delete-user-data/:userId', requireAuth, async (req, res) => {
    const { userId } = req.params;
    
    if (req.session.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const connection = await dbPool.getConnection();
        
        try {
            await connection.beginTransaction();
            
            await connection.execute('DELETE FROM tickets WHERE user_id = ?', [userId]);
            await connection.execute('DELETE FROM command_logs WHERE user_id = ?', [userId]);
            await connection.execute('DELETE FROM mod_logs WHERE target_id = ?', [userId]);
            await connection.execute('DELETE FROM arma3_logs WHERE player_id = ?', [userId]);
            const [result] = await connection.execute('DELETE FROM member_logs WHERE user_id = ?', [userId]);
            
            await connection.commit();
            
            res.json({ success: true, deletedRecords: result.affectedRows });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Delete user data error:', error);
        res.status(500).json({ error: 'Failed to delete user data' });
    }
});

// Backup database endpoint
app.post('/api/backup-database', requireAuth, async (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const { spawn } = require('child_process');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `./backups/bot_database_${timestamp}.sql`;
        
        // Create backups directory if it doesn't exist
        const fs = require('fs');
        if (!fs.existsSync('./backups')) {
            fs.mkdirSync('./backups');
        }
        
        // Use mysqldump to create backup
        const mysqldump = spawn('mysqldump', [
            `-h${process.env.DB_HOST}`,
            `-P${process.env.DB_PORT}`,
            `-u${process.env.DB_USER}`,
            `-p${process.env.DB_PASSWORD}`,
            process.env.DB_NAME
        ]);
        
        const writeStream = fs.createWriteStream(backupPath);
        mysqldump.stdout.pipe(writeStream);
        
        mysqldump.on('close', (code) => {
            if (code === 0) {
                res.json({ 
                    success: true, 
                    backupPath: backupPath,
                    timestamp: timestamp
                });
            } else {
                res.status(500).json({ error: 'Backup process failed' });
            }
        });
        
        mysqldump.on('error', (error) => {
            console.error('Backup error:', error);
            res.status(500).json({ error: 'Failed to create backup' });
        });
    } catch (error) {
        console.error('Backup database error:', error);
        res.status(500).json({ error: 'Failed to backup database' });
    }
});

// System information endpoint
app.get('/api/system-info', requireAuth, async (req, res) => {
    if (req.session.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    
    try {
        const os = require('os');
        const systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            uptime: os.uptime(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            cpuCount: os.cpus().length,
            nodeVersion: process.version,
            processUptime: process.uptime(),
            processMemory: process.memoryUsage(),
            discordJsVersion: require('discord.js').version
        };
        
        res.json(systemInfo);
    } catch (error) {
        console.error('System info error:', error);
        res.status(500).json({ error: 'Failed to get system information' });
    }
});

// Additional modal handler for leave setup
client.on('interactionCreate', async interaction => {
    if (interaction.isModalSubmit() && interaction.customId === 'leave-setup') {
        const channelId = interaction.fields.getTextInputValue('channel');
        const message = interaction.fields.getTextInputValue('message');
        
        // Validate channel
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) {
            return interaction.reply({
                content: 'Invalid channel ID provided.',
                ephemeral: true
            });
        }
        
        try {
            await query(
                'INSERT INTO welcome_settings (guild_id, leave_enabled, leave_channel_id, leave_message) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE leave_enabled = VALUES(leave_enabled), leave_channel_id = VALUES(leave_channel_id), leave_message = VALUES(leave_message)',
                [interaction.guild.id, true, channelId, message]
            );
            
            await interaction.reply({
                content: `Leave messages configured for ${channel}!\n\n**Preview:** ${message.replace('{user}', interaction.user.toString()).replace('{username}', interaction.user.username).replace('{server}', interaction.guild.name).replace('{membercount}', interaction.guild.memberCount.toString())}`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error saving leave settings:', error);
            await interaction.reply({
                content: 'Failed to save leave settings.',
                ephemeral: true
            });
        }
    }
});

// Error handling
client.on('error', console.error);
client.on('warn', console.warn);

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await dbPool.end();
    client.destroy();
    process.exit(0);
});

// Start web server
app.listen(PORT, () => {
    console.log(`Enhanced Discord Bot Panel running on port ${PORT}`);
    console.log(`Features: Welcome Messages, Verification, Embed System, Tickets, AutoMod`);
    console.log(`Web dashboard: http://localhost:${PORT}`);
});

// Start Discord bot
client.login(process.env.DISCORD_TOKEN);const { Client, GatewayIntentBits, Collection, EmbedBuilder, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
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
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
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

// Enhanced Commands Array
const allCommands = [
    // Existing moderation commands
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
    },

    // NEW ENHANCED COMMANDS
    {
        name: 'embed',
        description: 'Create and manage custom embed messages',
        options: [
            {
                name: 'action',
                description: 'Action to perform',
                type: 3,
                required: true,
                choices: [
                    { name: 'Create', value: 'create' },
                    { name: 'List', value: 'list' },
                    { name: 'Send', value: 'send' },
                    { name: 'Delete', value: 'delete' }
                ]
            },
            {
                name: 'name',
                description: 'Embed template name',
                type: 3,
                required: false
            },
            {
                name: 'channel',
                description: 'Channel to send embed to',
                type: 7,
                required: false
            }
        ]
    },
    {
        name: 'welcome',
        description: 'Configure welcome, leave, and verification system',
        options: [
            {
                name: 'action',
                description: 'Action to perform',
                type: 3,
                required: true,
                choices: [
                    { name: 'Setup Welcome', value: 'setup-welcome' },
                    { name: 'Setup Leave', value: 'setup-leave' },
                    { name: 'Setup Verification', value: 'setup-verification' },
                    { name: 'Test Welcome', value: 'test-welcome' },
                    { name: 'Test Leave', value: 'test-leave' },
                    { name: 'View Settings', value: 'view' }
                ]
            },
            {
                name: 'channel',
                description: 'Channel for messages',
                type: 7,
                required: false
            },
            {
                name: 'role',
                description: 'Role for verification',
                type: 8,
                required: false
            },
            {
                name: 'message',
                description: 'Custom message content',
                type: 3,
                required: false
            }
        ]
    },
    {
        name: 'verify',
        description: 'Create or manage verification system',
        options: [
            {
                name: 'channel',
                description: 'Channel to create verification message in',
                type: 7,
                required: false
            },
            {
                name: 'role',
                description: 'Role to assign when verified',
                type: 8,
                required: false
            }
        ]
    },
    {
        name: 'stats',
        description: 'Display server statistics and analytics',
        options: [
            {
                name: 'type',
                description: 'Type of statistics to display',
                type: 3,
                required: false,
                choices: [
                    { name: 'Members', value: 'members' },
                    { name: 'Activity', value: 'activity' },
                    { name: 'Moderation', value: 'moderation' },
                    { name: 'All', value: 'all' }
                ]
            }
        ]
    }
];

// Register slash commands
const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing enhanced application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: allCommands },
        );
        
        console.log(`Successfully reloaded ${allCommands.length} application (/) commands.`);
        console.log('Enhanced features: Embed System, Welcome Messages, Verification');
    } catch (error) {
        console.error('Command registration error:', error);
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
    client.user.setActivity('Enhanced Bot Panel | /help', { type: 'WATCHING' });
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

// Member Join Event Handler
client.on('guildMemberAdd', async member => {
    try {
        // Log member join
        await query(
            'INSERT INTO member_logs (user_id, username, guild_id, action_type, member_count) VALUES (?, ?, ?, ?, ?)',
            [member.id, member.user.username, member.guild.id, 'join', member.guild.memberCount]
        );

        // Get welcome settings
        const settings = await query(
            'SELECT * FROM welcome_settings WHERE guild_id = ? AND welcome_enabled = 1',
            [member.guild.id]
        );

        if (settings.length === 0) return;
        const setting = settings[0];

        // Send welcome message
        if (setting.welcome_channel_id) {
            const welcomeChannel = member.guild.channels.cache.get(setting.welcome_channel_id);
            if (welcomeChannel) {
                let welcomeContent = null;
                let welcomeEmbed = null;

                // Check if using custom embed template
                if (setting.welcome_embed_id) {
                    const embedData = await query(
                        'SELECT * FROM server_embeds WHERE id = ?',
                        [setting.welcome_embed_id]
                    );
                    
                    if (embedData.length > 0) {
                        welcomeEmbed = await buildEmbedFromTemplate(embedData[0], member.guild, member.user);
                    }
                } else if (setting.welcome_message) {
                    // Use text message
                    welcomeContent = replacePlaceholders(setting.welcome_message, member.guild, member.user);
                }

                if (welcomeEmbed || welcomeContent) {
                    const messageOptions = {};
                    if (welcomeContent) messageOptions.content = welcomeContent;
                    if (welcomeEmbed) messageOptions.embeds = [welcomeEmbed];

                    await welcomeChannel.send(messageOptions);
                }
            }
        }

        // Send welcome DM if verification is enabled
        if (setting.verification_enabled && setting.verification_channel_id && setting.verification_role_id) {
            try {
                const welcomeDM = new EmbedBuilder()
                    .setColor(0x0099FF)
                    .setTitle(`Welcome to ${member.guild.name}!`)
                    .setDescription('To gain full access to the server, you need to complete verification.')
                    .addFields(
                        { 
                            name: '📋 How to verify:', 
                            value: `1. Go to <#${setting.verification_channel_id}>\n2. React with ✅ to the verification message\n3. You'll automatically receive access!`
                        },
                        { 
                            name: '❓ Need help?', 
                            value: 'Contact a staff member if you have any questions.'
                        }
                    )
                    .setThumbnail(member.guild.iconURL())
                    .setFooter({ text: 'Welcome to the community!' })
                    .setTimestamp();

                await member.send({ embeds: [welcomeDM] });
            } catch (dmError) {
                console.log(`Could not send welcome DM to ${member.user.username}`);
            }
        }

    } catch (error) {
        console.error('Guild member add error:', error);
    }
});

// Member Leave Event Handler
client.on('guildMemberRemove', async member => {
    try {
        // Log member leave
        await query(
            'INSERT INTO member_logs (user_id, username, guild_id, action_type, member_count) VALUES (?, ?, ?, ?, ?)',
            [member.id, member.user.username, member.guild.id, 'leave', member.guild.memberCount]
        );

        // Get leave settings
        const settings = await query(
            'SELECT * FROM welcome_settings WHERE guild_id = ? AND leave_enabled = 1',
            [member.guild.id]
        );

        if (settings.length === 0) return;
        const setting = settings[0];

        // Send leave message
        if (setting.leave_channel_id) {
            const leaveChannel = member.guild.channels.cache.get(setting.leave_channel_id);
            if (leaveChannel) {
                let leaveContent = null;
                let leaveEmbed = null;

                // Check if using custom embed template
                if (setting.leave_embed_id) {
                    const embedData = await query(
                        'SELECT * FROM server_embeds WHERE id = ?',
                        [setting.leave_embed_id]
                    );
                    
                    if (embedData.length > 0) {
                        leaveEmbed = await buildEmbedFromTemplate(embedData[0], member.guild, member.user);
                    }
                } else if (setting.leave_message) {
                    // Use text message
                    leaveContent = replacePlaceholders(setting.leave_message, member.guild, member.user);
                }

                if (leaveEmbed || leaveContent) {
                    const messageOptions = {};
                    if (leaveContent) messageOptions.content = leaveContent;
                    if (leaveEmbed) messageOptions.embeds = [leaveEmbed];

                    await leaveChannel.send(messageOptions);
                }
            }
        }

        // Clean up pending verifications
        await query(
            'DELETE FROM pending_verifications WHERE user_id = ? AND guild_id = ?',
            [member.id, member.guild.id]
        );

    } catch (error) {
        console.error('Guild member remove error:', error);
    }
});

// Enhanced Reaction Handler for Verification
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.emoji.name !== '✅') return;

    try {
        // Fetch the message if it's partial
        if (reaction.message.partial) await reaction.message.fetch();
        if (reaction.partial) await reaction.fetch();

        const guild = reaction.message.guild;
        if (!guild) return;

        // Check if this is a verification message
        const settings = await query(
            'SELECT * FROM welcome_settings WHERE guild_id = ? AND verification_enabled = 1 AND verification_message_id = ?',
            [guild.id, reaction.message.id]
        );

        if (settings.length === 0) return;
        const setting = settings[0];

        const member = guild.members.cache.get(user.id);
        if (!member) return;

        const role = guild.roles.cache.get(setting.verification_role_id);
        if (!role) {
            console.error('Verification role not found:', setting.verification_role_id);
            return;
        }

        // Check if user already has the role
        if (member.roles.cache.has(role.id)) {
            return; // Already verified
        }

        // Add verification role
        await member.roles.add(role, 'Verification completed');

        // Log verification
        await query(
            'INSERT INTO member_logs (user_id, username, guild_id, action_type, member_count) VALUES (?, ?, ?, ?, ?)',
            [user.id, user.username, guild.id, 'verify', guild.memberCount]
        );

        // Send success DM
        try {
            const successEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Verification Successful!')
                .setDescription(`You have been verified in **${guild.name}**!`)
                .addFields(
                    { 
                        name: '🎉 Welcome!', 
                        value: 'You now have full access to the server and can participate in all channels.' 
                    },
                    { 
                        name: '📋 Next Steps', 
                        value: 'Feel free to explore the server, introduce yourself, and join conversations!' 
                    }
                )
                .setThumbnail(guild.iconURL())
                .setFooter({ text: `Welcome to ${guild.name}!` })
                .setTimestamp();

            await user.send({ embeds: [successEmbed] });
        } catch (dmError) {
            console.log(`Could not send verification success DM to ${user.username}`);
        }

        // Optional: Send verification log to a channel
        const modLogChannel = guild.channels.cache.find(ch => ch.name === 'mod-logs' || ch.name === 'verification-logs');
        if (modLogChannel) {
            const logEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Member Verified')
                .addFields(
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Role Added', value: role.name, inline: true },
                    { name: 'Member Count', value: guild.memberCount.toString(), inline: true }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp();

            await modLogChannel.send({ embeds: [logEmbed] });
        }

    } catch (error) {
        console.error('Verification reaction error:', error);
    }
});

// Enhanced interaction handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isModalSubmit()) return;

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('embed-create-')) {
            const embedName = interaction.customId.replace('embed-create-', '');
            const title = interaction.fields.getTextInputValue('title');
            const description = interaction.fields.getTextInputValue('description');
            const colorHex = interaction.fields.getTextInputValue('color');
            const footer = interaction.fields.getTextInputValue('footer');
            const image = interaction.fields.getTextInputValue('image');
            
            let color = 255; // Default blue
            if (colorHex && colorHex.startsWith('#')) {
                color = parseInt(colorHex.replace('#', ''), 16);
            }
            
            try {
                await query(
                    'INSERT INTO server_embeds (name, title, description, color, footer_text, image_url, guild_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [embedName, title || null, description || null, color, footer || null, image || null, interaction.guild.id, interaction.user.id]
                );
                
                await interaction.reply({
                    content: `✅ Embed template "${embedName}" created successfully! Use \`/embed send name:${embedName}\` to send it.`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error creating embed:', error);
                await interaction.reply({
                    content: '❌ Failed to create embed template. Please try again.',
                    ephemeral: true
                });
            }
        }
        
        if (interaction.customId === 'welcome-setup') {
            const channelId = interaction.fields.getTextInputValue('channel');
            const message = interaction.fields.getTextInputValue('message');
            
            // Validate channel
            const channel = interaction.guild.channels.cache.get(channelId);
            if (!channel) {
                return interaction.reply({
                    content: '❌ Invalid channel ID provided.',
                    ephemeral: true
                });
            }
            
            try {
                await query(
                    'INSERT INTO welcome_settings (guild_id, welcome_enabled, welcome_channel_id, welcome_message) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE welcome_enabled = VALUES(welcome_enabled), welcome_channel_id = VALUES(welcome_channel_id), welcome_message = VALUES(welcome_message)',
                    [interaction.guild.id, true, channelId, message]
                );
                
                await interaction.reply({
                    content: `✅ Welcome messages configured for ${channel}!\n\n**Preview:** ${message.replace('{user}', interaction.user.toString()).replace('{username}', interaction.user.username).replace('{server}', interaction.guild.name).replace('{membercount}', interaction.guild.memberCount.toString())}`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error saving welcome settings:', error);
                await interaction.reply({
                    content: '❌ Failed to save welcome settings.',
                    ephemeral: true
                });
            }
        }
        
        if (interaction.customId === 'verification-setup') {
            const channelId = interaction.fields.getTextInputValue('channel');
            const roleId = interaction.fields.getTextInputValue('role');
            const message = interaction.fields.getTextInputValue('message');
            
            // Validate channel and role
            const channel = interaction.guild.channels.cache.get(channelId);
            const role = interaction.guild.roles.cache.get(roleId);
            
            if (!channel) {
                return interaction.reply({
                    content: '❌ Invalid channel ID provided.',
                    ephemeral: true
                });
            }
            
            if (!role) {
                return interaction.reply({
                    content: '❌ Invalid role ID provided.',
                    ephemeral: true
                });
            }
            
            try {
                await query(
                    'INSERT INTO welcome_settings (guild_id, verification_enabled, verification_channel_id, verification_role_id, verification_message) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE verification_enabled = VALUES(verification_enabled), verification_channel_id = VALUES(verification_channel_id), verification_role_id = VALUES(verification_role_id), verification_message = VALUES(verification_message)',
                    [interaction.guild.id, true, channelId, roleId, message]
                );
                
                await interaction.reply({
                    content: `✅ Verification system configured!\n**Channel:** ${channel}\n**Role:** ${role}\n\nUse \`/verify\` to create the verification message.`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error saving verification settings:', error);
                await interaction.reply({
                    content: '❌ Failed to save verification settings.',
                    ephemeral: true
                });
            }
        }
        
        return;
    }

    // Handle slash commands
    const { commandName, options, user, guild, channel } = interaction;

    // Log command usage
    const args = options?.data.map(opt => `${opt.name}: ${opt.value}`).join(', ') || '';
    await query(
        'INSERT INTO command_logs (command_name, user_id, username, channel_id, channel_name, guild_id, arguments) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [commandName, user.id, user.username, channel.id, channel.name, guild.id, args]
    ).catch(console.error);

    // Handle all commands
    switch (commandName) {
        // Existing commands
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
            
        // NEW ENHANCED COMMANDS
        case 'embed':
            await handleEmbed(interaction);
            break;
        case 'welcome':
            await handleWelcome(interaction);
            break;
        case 'verify':
            await handleVerify(interaction);
            break;
        case 'stats':
            await handleStats(interaction);
            break;
    }
});

// Helper function to replace placeholders in messages
function replacePlaceholders(text, guild, user) {
    if (!text) return text;
    
    return text
        .replace(/\{user\}/g, user.toString())
        .replace(/\{username\}/g, user.username)
        .replace(/\{server\}/g, guild.name)
        .replace(/\{membercount\}/g, guild.memberCount.toString())
        .replace(/\{mention\}/g, user.toString()) // Alternative placeholder
        .replace(/\{servername\}/g, guild.name)   // Alternative placeholder
        .replace(/\{members\}/g, guild.memberCount.toString()); // Alternative placeholder
}

// Helper function to build embed from template
async function buildEmbedFromTemplate(template, guild, user) {
    const embed = new EmbedBuilder();
    
    // Replace placeholders in all text fields
    if (template.title) {
        embed.setTitle(replacePlaceholders(template.title, guild, user));
    }
    
    if (template.description) {
        embed.setDescription(replacePlaceholders(template.description, guild, user));
    }
    
    if (template.color) {
        embed.setColor(template.color);
    }
    
    if (template.author_name) {
        const authorOptions = { name: replacePlaceholders(template.author_name, guild, user) };
        if (template.author_icon) authorOptions.iconURL = template.author_icon;
        embed.setAuthor(authorOptions);
    }
    
    if (template.footer_text) {
        const footerOptions = { text: replacePlaceholders(template.footer_text, guild, user) };
        if (template.footer_icon) footerOptions.iconURL = template.footer_icon;
        embed.setFooter(footerOptions);
    }
    
    if (template.image_url) {
        embed.setImage(template.image_url);
    }
    
    if (template.thumbnail_url) {
        embed.setThumbnail(template.thumbnail_url);
    }
    
    // Add fields if they exist
    if (template.fields) {
        try {
            const fields = typeof template.fields === 'string' ? JSON.parse(template.fields) : template.fields;
            
            if (Array.isArray(fields)) {
                fields.forEach(field => {
                    embed.addFields({
                        name: replacePlaceholders(field.name, guild, user),
                        value: replacePlaceholders(field.value, guild, user),
                        inline: field.inline || false
                    });
                });
            }
        } catch (parseError) {
            console.error('Error parsing embed fields:', parseError);
        }
    }
    
    embed.setTimestamp();
    return embed;
}

// Enhanced Command Handlers

// Embed command handler
async function handleEmbed(interaction) {
    const action = interaction.options.getString('action');
    
    switch (action) {
        case 'create':
            await handleEmbedCreate(interaction);
            break;
        case 'list':
            await handleEmbedList(interaction);
            break;
        case 'send':
            await handleEmbedSend(interaction);
            break;
        case 'delete':
            await handleEmbedDelete(interaction);
            break;
    }
}

async function handleEmbedCreate(interaction) {
    const name = interaction.options.getString('name');
    
    if (!name) {
        return interaction.reply({
            content: '❌ Please provide a name for your embed template.',
            ephemeral: true
        });
    }
    
    // Check if embed already exists
    const existingEmbed = await query(
        'SELECT id FROM server_embeds WHERE name = ? AND guild_id = ?',
        [name, interaction.guild.id]
    );
    
    if (existingEmbed.length > 0) {
        return interaction.reply({
            content: `❌ An embed template with the name "${name}" already exists.`,
            ephemeral: true
        });
    }
    
    // Create modal for embed creation
    const modal = new ModalBuilder()
        .setCustomId(`embed-create-${name}`)
        .setTitle(`Create Embed: ${name}`);
    
    const titleInput = new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Embed Title')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Enter embed title...');
    
    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Embed Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Enter embed description...\nYou can use {user}, {username}, {server}, {membercount}');
    
    const colorInput = new TextInputBuilder()
        .setCustomId('color')
        .setLabel('Embed Color (hex code)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('#0099ff');
    
    const footerInput = new TextInputBuilder()
        .setCustomId('footer')
        .setLabel('Footer Text')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Footer text...');
    
    const imageInput = new TextInputBuilder()
        .setCustomId('image')
        .setLabel('Image URL')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('https://example.com/image.png');
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(footerInput),
        new ActionRowBuilder().addComponents(imageInput)
    );
    
    await interaction.showModal(modal);
}

async function handleEmbedList(interaction) {
    const embeds = await query(
        'SELECT name, title, created_by, created_at FROM server_embeds WHERE guild_id = ? ORDER BY created_at DESC',
        [interaction.guild.id]
    );
    
    if (embeds.length === 0) {
        return interaction.reply({
            content: '📝 No embed templates found. Create one with `/embed create`!',
            ephemeral: true
        });
    }
    
    const embedList = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('📚 Embed Templates')
        .setDescription('Available embed templates in this server:')
        .addFields(
            embeds.slice(0, 25).map(embed => ({
                name: embed.name,
                value: `${embed.title || 'No title'}\nCreated by <@${embed.created_by}> on ${new Date(embed.created_at).toLocaleDateString()}`,
                inline: true
            }))
        )
        .setFooter({ text: `${embeds.length} total templates` })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embedList], ephemeral: true });
}

async function handleEmbedSend(interaction) {
    const name = interaction.options.getString('name');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    
    if (!name) {
        return interaction.reply({
            content: '❌ Please provide the name of the embed template to send.',
            ephemeral: true
        });
    }
    
    const embedData = await query(
        'SELECT * FROM server_embeds WHERE name = ? AND guild_id = ?',
        [name, interaction.guild.id]
    );
    
    if (embedData.length === 0) {
        return interaction.reply({
            content: `❌ No embed template found with the name "${name}".`,
            ephemeral: true
        });
    }
    
    const embed = await buildEmbedFromTemplate(embedData[0], interaction.guild, interaction.user);
    
    try {
        await channel.send({ embeds: [embed] });
        await interaction.reply({
            content: `✅ Embed "${name}" sent to ${channel}!`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error sending embed:', error);
        await interaction.reply({
            content: '❌ Failed to send embed. Please check my permissions.',
            ephemeral: true
        });
    }
}

async function handleEmbedDelete(interaction) {
    const name = interaction.options.getString('name');
    
    if (!name) {
        return interaction.reply({
            content: '❌ Please provide the name of the embed template to delete.',
            ephemeral: true
        });
    }
    
    const result = await query(
        'DELETE FROM server_embeds WHERE name = ? AND guild_id = ?',
        [name, interaction.guild.id]
    );
    
    if (result.affectedRows === 0) {
        return interaction.reply({
            content: `❌ No embed template found with the name "${name}".`,
            ephemeral: true
        });
    }
    
    await interaction.reply({
        content: `✅ Embed template "${name}" deleted successfully!`,
        ephemeral: true
    });
}

// Welcome command handler
async function handleWelcome(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            content: '❌ You need "Manage Server" permission to configure welcome settings.',
            ephemeral: true
        });
    }
    
    const action = interaction.options.getString('action');
    
    switch (action) {
        case 'setup-welcome':
            await handleWelcomeSetup(interaction);
            break;
        case 'setup-leave':
            await handleLeaveSetup(interaction);
            break;
        case 'setup-verification':
            await handleVerificationSetup(interaction);
            break;
        case 'test-welcome':
            await handleWelcomeTest(interaction);
            break;
        case 'test-leave':
            await handleLeaveTest(interaction);
            break;
        case 'view':
            await handleWelcomeView(interaction);
            break;
    }
}

async function handleWelcomeSetup(interaction) {
    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    
    const modal = new ModalBuilder()
        .setCustomId('welcome-setup')
        .setTitle('Setup Welcome Messages');
    
    const channelInput = new TextInputBuilder()
        .setCustomId('channel')
        .setLabel('Welcome Channel ID')
        .setStyle(TextInputStyle.Short)
        .setValue(channel?.id || '')
        .setPlaceholder('Channel ID where welcome messages are sent');
    
    const messageInput = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Welcome Message')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(message || 'Welcome to {server}, {user}! We now have {membercount} members!')
        .setPlaceholder('Use {user}, {username}, {server}, {membercount}');
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(channelInput),
        new ActionRowBuilder().addComponents(messageInput)
    );
    
    await interaction.showModal(modal);
}

async function handleLeaveSetup(interaction) {
    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    
    const modal = new ModalBuilder()
        .setCustomId('leave-setup')
        .setTitle('Setup Leave Messages');
    
    const channelInput = new TextInputBuilder()
        .setCustomId('channel')
        .setLabel('Leave Channel ID')
        .setStyle(TextInputStyle.Short)
        .setValue(channel?.id || '')
        .setPlaceholder('Channel ID where leave messages are sent');
    
    const messageInput = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Leave Message')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(message || '{username} has left {server}. We now have {membercount} members.')
        .setPlaceholder('Use {user}, {username}, {server}, {membercount}');
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(channelInput),
        new ActionRowBuilder().addComponents(messageInput)
    );
    
    await interaction.showModal(modal);
}

async function handleVerificationSetup(interaction) {
    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');
    const message = interaction.options.getString('message');
    
    const modal = new ModalBuilder()
        .setCustomId('verification-setup')
        .setTitle('Setup Verification System');
    
    const channelInput = new TextInputBuilder()
        .setCustomId('channel')
        .setLabel('Verification Channel ID')
        .setStyle(TextInputStyle.Short)
        .setValue(channel?.id || '')
        .setPlaceholder('Channel ID where verification message will be posted');
    
    const roleInput = new TextInputBuilder()
        .setCustomId('role')
        .setLabel('Verified Role ID')
        .setStyle(TextInputStyle.Short)
        .setValue(role?.id || '')
        .setPlaceholder('Role ID to assign when users verify');
    
    const messageInput = new TextInputBuilder()
        .setCustomId('message')
        .setLabel('Verification Message')
        .setStyle(TextInputStyle.Paragraph)
        .setValue(message || 'React with ✅ to verify and gain access to the server!')
        .setPlaceholder('Message to display in verification embed');
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(channelInput),
        new ActionRowBuilder().addComponents(roleInput),
        new ActionRowBuilder().addComponents(messageInput)
    );
    
    await interaction.showModal(modal);
}

async function handleWelcomeTest(interaction) {
    const settings = await query(
        'SELECT * FROM welcome_settings WHERE guild_id = ? AND welcome_enabled = 1',
        [interaction.guild.id]
    );

    if (settings.length === 0 || !settings[0].welcome_channel_id) {
        return interaction.reply({
            content: '❌ Welcome messages not configured. Use `/welcome setup-welcome` first.',
            ephemeral: true
        });
    }

    const setting = settings[0];
    const channel = interaction.guild.channels.cache.get(setting.welcome_channel_id);
    
    if (!channel) {
        return interaction.reply({
            content: '❌ Welcome channel not found.',
            ephemeral: true
        });
    }

    let message = setting.welcome_message || 'Welcome to {server}, {user}!';
    message = replacePlaceholders(message, interaction.guild, interaction.user);

    const testEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🧪 Test Welcome Message')
        .setDescription(message)
        .setFooter({ text: 'This is a test message' })
        .setTimestamp();

    await channel.send({ embeds: [testEmbed] });
    
    await interaction.reply({
        content: `✅ Test welcome message sent to ${channel}!`,
        ephemeral: true
    });
}

async function handleLeaveTest(interaction) {
    const settings = await query(
        'SELECT * FROM welcome_settings WHERE guild_id = ? AND leave_enabled = 1',
        [interaction.guild.id]
    );

    if (settings.length === 0 || !settings[0].leave_channel_id) {
        return interaction.reply({
            content: '❌ Leave messages not configured. Use `/welcome setup-leave` first.',
            ephemeral: true
        });
    }

    const setting = settings[0];
    const channel = interaction.guild.channels.cache.get(setting.leave_channel_id);
    
    if (!channel) {
        return interaction.reply({
            content: '❌ Leave channel not found.',
            ephemeral: true
        });
    }

    let message = setting.leave_message || '{username} has left {server}.';
    message = replacePlaceholders(message, interaction.guild, interaction.user);

    const testEmbed = new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle('🧪 Test Leave Message')
        .setDescription(message)
        .setFooter({ text: 'This is a test message' })
        .setTimestamp();

    await channel.send({ embeds: [testEmbed] });
    
    await interaction.reply({
        content: `✅ Test leave message sent to ${channel}!`,
        ephemeral: true
    });
}

async function handleWelcomeView(interaction) {
    const settings = await query(
        'SELECT * FROM welcome_settings WHERE guild_id = ?',
        [interaction.guild.id]
    );

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('⚙️ Welcome System Settings')
        .setTimestamp();

    if (settings.length === 0) {
        embed.setDescription('No welcome settings configured yet.');
    } else {
        const setting = settings[0];
        
        embed.addFields(
            { 
                name: '👋 Welcome Messages', 
                value: setting.welcome_enabled ? 
                    `✅ Enabled\nChannel: <#${setting.welcome_channel_id}>\nMessage: ${setting.welcome_message?.substring(0, 100) || 'Default'}${setting.welcome_message?.length > 100 ? '...' : ''}` :
                    '❌ Disabled',
                inline: true 
            },
            { 
                name: '👋 Leave Messages', 
                value: setting.leave_enabled ? 
                    `✅ Enabled\nChannel: <#${setting.leave_channel_id}>\nMessage: ${setting.leave_message?.substring(0, 100) || 'Default'}${setting.leave_message?.length > 100 ? '...' : ''}` :
                    '❌ Disabled',
                inline: true 
            },
            { 
                name: '🔐 Verification', 
                value: setting.verification_enabled ? 
                    `✅ Enabled\nChannel: <#${setting.verification_channel_id}>\nRole: <@&${setting.verification_role_id}>` :
                    '❌ Disabled',
                inline: true 
            }
        );
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Verify command handler
async function handleVerify(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return interaction.reply({
            content: '❌ You need "Manage Roles" permission to use this command.',
            ephemeral: true
        });
    }
    
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const role = interaction.options.getRole('role');
    
    // Get verification settings
    const settings = await query(
        'SELECT * FROM welcome_settings WHERE guild_id = ?',
        [interaction.guild.id]
    );
    
    let verificationRole = role;
    if (!verificationRole && settings.length > 0) {
        verificationRole = interaction.guild.roles.cache.get(settings[0].verification_role_id);
    }
    
    if (!verificationRole) {
        return interaction.reply({
            content: '❌ No verification role specified. Please provide a role or configure it with `/welcome setup-verification`.',
            ephemeral: true
        });
    }
    
    // Create verification message with reaction
    const verifyEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🔐 Server Verification')
        .setDescription('Welcome to the server! To gain full access, please react with ✅ below.')
        .addFields(
            { name: '📋 Instructions', value: '1. Read the server rules\n2. React with ✅ to this message\n3. You will receive your verified role automatically' },
            { name: '❓ Need Help?', value: 'Contact a staff member if you have questions.' }
        )
        .setFooter({ text: 'This verification helps keep our community safe' })
        .setTimestamp();
    
    const message = await channel.send({ embeds: [verifyEmbed] });
    await message.react('✅');
    
    // Store verification message info
    await query(
        'INSERT INTO welcome_settings (guild_id, verification_enabled, verification_channel_id, verification_role_id, verification_message_id) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE verification_enabled = 1, verification_channel_id = VALUES(verification_channel_id), verification_role_id = VALUES(verification_role_id), verification_message_id = VALUES(verification_message_id)',
        [interaction.guild.id, true, channel.id, verificationRole.id, message.id]
    );
    
    await interaction.reply({
        content: `✅ Verification message created in ${channel}! Members can react with ✅ to get the ${verificationRole} role.`,
        ephemeral: true
    });
}

// Stats command handler
async function handleStats(interaction) {
    const type = interaction.options?.getString('type') || 'all';
    
    try {
        const guild = interaction.guild;
        const statsEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`📊 ${guild.name} Statistics`)
            .setThumbnail(guild.iconURL())
            .setTimestamp();
        
        if (type === 'members' || type === 'all') {
            // Member statistics
            const memberLogs = await query(
                'SELECT action_type, COUNT(*) as count FROM member_logs WHERE guild_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY action_type',
                [guild.id]
            );
            
            const joins = memberLogs.find(log => log.action_type === 'join')?.count || 0;
            const leaves = memberLogs.find(log => log.action_type === 'leave')?.count || 0;
            const verifications = memberLogs.find(log => log.action_type === 'verify')?.count || 0;
            
            statsEmbed.addFields({
                name: '👥 Member Activity (30 days)',
                value: `**Joins:** ${joins}\n**Leaves:** ${leaves}\n**Verifications:** ${verifications}\n**Net Growth:** ${joins - leaves}`,
                inline: true
            });
        }
        
        if (type === 'activity' || type === 'all') {
            // Command usage statistics
            const commandStats = await query(
                'SELECT command_name, COUNT(*) as count FROM command_logs WHERE guild_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY command_name ORDER BY count DESC LIMIT 5',
                [guild.id]
            );
            
            const commandList = commandStats.map(cmd => `**${cmd.command_name}:** ${cmd.count}`).join('\n') || 'No recent activity';
            
            statsEmbed.addFields({
                name: '⚡ Top Commands (7 days)',
                value: commandList,
                inline: true
            });
        }
        
        if (type === 'moderation' || type === 'all') {
            // Moderation statistics
            const modStats = await query(
                'SELECT action_type, COUNT(*) as count FROM mod_logs WHERE guild_id = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY action_type',
                [guild.id]
            );
            
            const modList = modStats.map(mod => `**${mod.action_type}:** ${mod.count}`).join('\n') || 'No recent moderation';
            
            statsEmbed.addFields({
                name: '🛡️ Moderation (30 days)',
                value: modList,
                inline: true
            });
        }
        
        // General server info
        statsEmbed.addFields(
            { name: '📈 Current Members', value: guild.memberCount.toString(), inline: true },
            { name: '📅 Server Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
            { name: '🎭 Total Roles', value: guild.roles.cache.size.toString(), inline: true }
        );
        
        await interaction.reply({ embeds: [statsEmbed] });
        
    } catch (error) {
        console.error('Stats command error:', error);
        await interaction.reply({
            content: '❌ Failed to retrieve server statistics.',
            ephemeral: true
        });
    }
}

// Original Moderation command handlers
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
        await query(
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
        await query(
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
        await query(
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
        await query(
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
        await query(
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
    
    try {
        // Check if user already has an open ticket
        const existingTicket = await query('SELECT * FROM tickets WHERE user_id = ? AND status = "open"', [user.id]);
        
        if (existingTicket.length > 0) {
            return interaction.reply({ content: 'You already have an open ticket!', ephemeral: true });
        }

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

        const ticketId = `ticket-${user.username}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g