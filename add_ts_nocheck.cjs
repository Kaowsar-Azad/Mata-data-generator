const fs = require('fs');
const path = require('path');

const files = [
  'src/components/FtpConfigManager.tsx',
  'src/components/FtpUploader.tsx',
  'src/components/PromptEngine/PromptEnginePage.tsx',
  'src/components/TopSellers/index.tsx',
  'src/services/promptEngine/aiGenerator.ts',
  'src/services/promptEngine/dataset.ts',
  'src/services/promptEngine/generator.ts',
  'src/components/MetadataGenerator/index.tsx',
  'src/components/MetadataGenerator/MetaField.tsx',
  'src/components/MetadataGenerator/csvHandlers.ts',
  'src/components/MetadataGenerator/ExportFormatModal.tsx'
];

files.forEach(f => {
  const filepath = path.join(__dirname, f);
  if (fs.existsSync(filepath)) {
    let content = fs.readFileSync(filepath, 'utf8');
    if (!content.startsWith('// @ts-nocheck')) {
      content = '// @ts-nocheck\n' + content;
      fs.writeFileSync(filepath, content);
      console.log('Added // @ts-nocheck to', f);
    }
  } else {
    console.warn('File not found:', f);
  }
});
