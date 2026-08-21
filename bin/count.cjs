const fs = require('fs');
['src/services/apis/openai.js', 'src/services/apis/mistral.js'].forEach(file => {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((l, i) => {
        if(l.includes('`')) {
            const count = (l.match(/`/g) || []).length;
            console.log(file, i + 1, 'count:', count, l.trim());
        }
    });
});
