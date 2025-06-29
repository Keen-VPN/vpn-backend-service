import { handler } from './functions/api.js';

// Test the Netlify function locally
async function testFunction() {
    console.log('🧪 Testing Netlify Function locally...\n');

    // Test health endpoint
    const healthEvent = {
        httpMethod: 'GET',
        path: '/health',
        queryStringParameters: null,
        headers: {
            'Content-Type': 'application/json'
        },
        body: null,
        isBase64Encoded: false
    };

    try {
        console.log('📡 Testing /health endpoint...');
        const healthResponse = await handler(healthEvent, {});
        console.log('✅ Health endpoint response:', JSON.parse(healthResponse.body));
    } catch (error) {
        console.error('❌ Health endpoint failed:', error);
    }

    // Test 404 endpoint
    const notFoundEvent = {
        httpMethod: 'GET',
        path: '/nonexistent',
        queryStringParameters: null,
        headers: {
            'Content-Type': 'application/json'
        },
        body: null,
        isBase64Encoded: false
    };

    try {
        console.log('\n📡 Testing 404 endpoint...');
        const notFoundResponse = await handler(notFoundEvent, {});
        console.log('✅ 404 endpoint response:', JSON.parse(notFoundResponse.body));
    } catch (error) {
        console.error('❌ 404 endpoint failed:', error);
    }

    console.log('\n🎉 Netlify Function test completed!');
}

testFunction().catch(console.error); 