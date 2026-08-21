const fs = require('fs');
let mistral = fs.readFileSync('src/services/apis/mistral.js', 'utf8');
let openai = fs.readFileSync('src/services/apis/openai.js', 'utf8');

const anchor = 'processedPrompt = dynamicInstruction + `You are a forensic-level visual prompt engineer.';
const mParts = mistral.split(anchor);
const oParts = openai.split(anchor);

const newOpenai = oParts[0] + anchor + mParts[1];
fs.writeFileSync('src/services/apis/openai.js', newOpenai);
console.log('Fixed openai.js');
