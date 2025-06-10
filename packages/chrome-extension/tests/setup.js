// Setup file for Jest tests
// Add missing globals for jsdom
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;