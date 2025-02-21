// server.js
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const Twitter = require('twitter-api-v2').TwitterApi;
require('dotenv').config();

const app = express();
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Serve static files
app.use(express.static('public'));

// Twitter client configuration
const twitterClient = new Twitter({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});
async function testTwitterAuth() {
    try {
        const me = await twitterClient.v2.me();
        console.log('✅ Twitter authentication successful!');
        console.log('Connected as:', me.data.username);
    } catch (error) {
        console.error('❌ Twitter authentication failed:', error);
    }
}
// Image size configurations
const imageSizes = [
    { width: 300, height: 250 },
    { width: 728, height: 90 },
    { width: 160, height: 600 },
    { width: 300, height: 600 }
];

app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            console.log('❌ No file received');
            return res.status(400).json({ error: 'No image file uploaded' });
        }

        console.log('📁 File received:', {
            filename: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        // Test Twitter authentication before processing
        try {
            const user = await twitterClient.v2.me();
            console.log('✅ Twitter auth successful, posting as:', user.data.username);
        } catch (authError) {
            console.error('❌ Twitter auth failed:', authError);
            return res.status(401).json({ error: 'Twitter authentication failed' });
        }

        const resizedImages = [];

        // Process image for each size
        for (const size of imageSizes) {
            console.log(`🔄 Resizing to ${size.width}x${size.height}`);
            try {
                const resizedBuffer = await sharp(req.file.buffer)
                    .resize(size.width, size.height, {
                        fit: 'cover',
                        position: 'center'
                    })
                    .toBuffer();

                resizedImages.push({
                    buffer: resizedBuffer,
                    width: size.width,
                    height: size.height
                });
                console.log(`✅ Resized to ${size.width}x${size.height} successfully`);
            } catch (resizeError) {
                console.error('❌ Resize error:', resizeError);
                throw new Error(`Failed to resize image to ${size.width}x${size.height}`);
            }
        }

        // Upload images to Twitter
        const mediaIds = [];
        for (const [index, image] of resizedImages.entries()) {
            console.log(`📤 Uploading image ${index + 1} to Twitter...`);
            try {
                const mediaResponse = await twitterClient.v1.uploadMedia(image.buffer, {
                    mimeType: req.file.mimetype
                });
                mediaIds.push(mediaResponse);
                console.log(`✅ Image ${index + 1} uploaded, ID:`, mediaResponse);
            } catch (uploadError) {
                console.error('❌ Twitter upload error:', uploadError);
                throw new Error(`Failed to upload image ${index + 1} to Twitter`);
            }
        }

        // Post tweet with media
        try {
            console.log('📝 Posting tweet with media IDs:', mediaIds);
            const tweet = await twitterClient.v2.tweet({
                text: 'Processed images from my web app!',
                media: { media_ids: mediaIds }
            });
            console.log('✅ Tweet posted successfully:', tweet);

            res.json({ 
                success: true, 
                message: 'Images processed and posted successfully',
                tweet: tweet
            });
        } catch (tweetError) {
            console.error('❌ Tweet posting error:', tweetError);
            throw new Error('Failed to post tweet');
        }

    } catch (error) {
        console.error('❌ Main error:', error);
        res.status(500).json({ 
            error: 'An error occurred while processing the image',
            details: error.message
        });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});