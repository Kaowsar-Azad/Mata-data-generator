const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/MetadataGenerator/index.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/padding:\s*'0\.38rem\s+0\.8rem'/g, "padding: '0.25rem 0.6rem'");
content = content.replace(/fontSize:\s*'0\.875rem'/g, "fontSize: '0.75rem'");
content = content.replace(/fontWeight:\s*600/g, "fontWeight: 500");
// Also some could be 0.82rem
content = content.replace(/fontSize:\s*'0\.82rem'/g, "fontSize: '0.75rem'");

fs.writeFileSync(file, content);
console.log('Fixed button sizes in index.tsx');
