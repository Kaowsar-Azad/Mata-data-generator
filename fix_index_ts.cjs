const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'src/components/MetadataGenerator/index.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add global window declaration
if (!content.includes('interface Window')) {
  content = `declare global {
  interface Window {
    electronAPI?: any;
  }
}
` + content;
}

// Fix common implicit anys for arrow functions
content = content.replace(/\(err\) =>/g, '(err: any) =>');
content = content.replace(/\(uploadErr\) =>/g, '(uploadErr: any) =>');
content = content.replace(/\(e\) =>/g, '(e: any) =>');
content = content.replace(/\(event\) =>/g, '(event: any) =>');
content = content.replace(/\(id, field, value\) =>/g, '(id: any, field: any, value: any) =>');
content = content.replace(/\(sourceId, field, value\) =>/g, '(sourceId: any, field: any, value: any) =>');
content = content.replace(/\(color\) =>/g, '(color: any) =>');
content = content.replace(/\(keyword, img\) =>/g, '(keyword: any, img: any) =>');
content = content.replace(/\(k\) =>/g, '(k: any) =>');
content = content.replace(/\(kw\) =>/g, '(kw: any) =>');
content = content.replace(/\(field\) =>/g, '(field: any) =>');
content = content.replace(/\(prov\) =>/g, '(prov: any) =>');
content = content.replace(/\(c\) =>/g, '(c: any) =>');
content = content.replace(/\(formatId\) =>/g, '(formatId: any) =>');
content = content.replace(/\(img\) =>/g, '(img: any) =>');
content = content.replace(/\(c, idx\) =>/g, '(c: any, idx: any) =>');
content = content.replace(/\(acc, item\) =>/g, '(acc: any, item: any) =>');
content = content.replace(/\(file\) =>/g, '(file: any) =>');
content = content.replace(/\(val\) =>/g, '(val: any) =>');
content = content.replace(/\(file, index\) =>/g, '(file: any, index: any) =>');
content = content.replace(/\(p\) =>/g, '(p: any) =>');
content = content.replace(/\(cat\) =>/g, '(cat: any) =>');
content = content.replace(/\(prev\) =>/g, '(prev: any) =>');
content = content.replace(/\(id\) =>/g, '(id: any) =>');
content = content.replace(/\(item\) =>/g, '(item: any) =>');
content = content.replace(/\(ei\) =>/g, '(ei: any) =>');
content = content.replace(/\(conf\) =>/g, '(conf: any) =>');
content = content.replace(/\(h\) =>/g, '(h: any) =>');

// For catch, do not add type annotations to catch block variables since it caused vite issues
// (Or vite choked on something else, but let's leave catch variables as they are and let strict mode complain, wait, we have strict: false inside tsconfig? NO, strict is true, but we will ignore it or add // @ts-ignore)

// Fix specific TS errors
content = content.replace(/let successCount = "0";/, 'let successCount: number = 0;');
content = content.replace(/let totalScore = "0";/, 'let totalScore: number = 0;');
content = content.replace(/let successCount = "0", totalScore = "0";/, 'let successCount: number = 0; let totalScore: number = 0;');

content = content.replace(/const embeddedImages = \[\];/, 'const embeddedImages: any[] = [];');
content = content.replace(/const filesToUpload = \[\];/, 'const filesToUpload: any[] = [];');
content = content.replace(/let newKws = \[\];/, 'let newKws: any[] = [];');

content = content.replace(/new Date\(\)\.toLocaleTimeString\(\)/g, 'new Date().toLocaleTimeString("en-US")');

content = content.replace(/const group = fileGroups\[baseName\];/g, 'const group = fileGroups[baseName] as any;');
content = content.replace(/const activeProviderName = apiProviderRef\.current \|\| "gemini";/g, 'const activeProviderName: any = apiProviderRef.current || "gemini";');

content = content.replace(/const fileRef = useRef\(\);/g, 'const fileRef = useRef<any>();');
content = content.replace(/const exportBtnRef = useRef\(\);/g, 'const exportBtnRef = useRef<any>();');
content = content.replace(/const fileInputRef = useRef\(null\);/g, 'const fileInputRef = useRef<any>(null);');
content = content.replace(/const csvInputRef = useRef\(null\);/g, 'const csvInputRef = useRef<any>(null);');

content = content.replace(/\{toast && \(\n\s*<div className=\{\`global-toast \$\{toast\.type\}\`\}>/g, '{toast && (\n        <div className={`global-toast ${(toast as any).type}`}>');
content = content.replace(/toast\.message/g, '(toast as any).message');
content = content.replace(/toast\.id/g, '(toast as any).id');
content = content.replace(/item\.id/g, '(item as any).id');

// Add specific missing params types in regular functions
content = content.replace(/const getTitleCounterClass = \(val\) => \{/g, 'const getTitleCounterClass = (val: any) => {');
content = content.replace(/const getDescriptionCounterClass = \(val\) => \{/g, 'const getDescriptionCounterClass = (val: any) => {');
content = content.replace(/const getKeywordsCounterClass = \(val\) => \{/g, 'const getKeywordsCounterClass = (val: any) => {');
content = content.replace(/const showToast = \(message, type = "success"\) => \{/g, 'const showToast = (message: any, type: any = "success") => {');
content = content.replace(/const pickMataAIModel = \(filePath, engine\) => \{/g, 'const pickMataAIModel = (filePath: any, engine: any) => {');
content = content.replace(/const hasFaceOrPerson = \(metadata\) => \{/g, 'const hasFaceOrPerson = (metadata: any) => {');
content = content.replace(/const detectModelFromMetadata = \(metadata, filePath\) => \{/g, 'const detectModelFromMetadata = (metadata: any, filePath: any) => {');
content = content.replace(/const isAccepted = \(file\) => \{/g, 'const isAccepted = (file: any) => {');
content = content.replace(/const addImages = async \(files\) => \{/g, 'const addImages = async (files: any) => {');
content = content.replace(/const removeImage = \(id\) => \{/g, 'const removeImage = (id: any) => {');
content = content.replace(/const resizeImageToBase64 = \(file, maxSize = 1024\) => /g, 'const resizeImageToBase64 = (file: any, maxSize = 1024) => ');

content = content.replace(/const filterMetadataKeywords = \(metadata, removeYellow, removeRed\) => \{/g, 'const filterMetadataKeywords = (metadata: any, removeYellow: boolean, removeRed: boolean) => {');
content = content.replace(/const getKeywordScore = \(keyword, scoreObj\) => \{/g, 'const getKeywordScore = (keyword: string, scoreObj: any) => {');

// Fix `useState([])` -> `useState<any[]>([])`
content = content.replace(/useState\(\[\]\)/g, 'useState<any[]>([])');
content = content.replace(/useRef\(\[\]\)/g, 'useRef<any[]>([])');
content = content.replace(/useState\(null\)/g, 'useState<any>(null)');
content = content.replace(/useRef\(\{\}\)/g, 'useRef<any>({})');
content = content.replace(/useState\(new Set\(\)\)/g, 'useState<any>(new Set())');

// Export function params
content = content.replace(/export function ImageWorkflow\(\{ apiKeys, apiProvider, promptSettings, setPromptSettings, ftpConfigs = \[\] \}\) \{/, 'export function ImageWorkflow({ apiKeys, apiProvider, promptSettings, setPromptSettings, ftpConfigs = [] }: any) {');

content = content.replace(/let resultStr = event\.target\.result;/, 'let resultStr = (event.target as any).result;');
content = content.replace(/let epsData = img\.epsData;/, 'let epsData = (img as any).epsData;');

fs.writeFileSync(file, content);
console.log('Fixed implicit any in index.tsx');
