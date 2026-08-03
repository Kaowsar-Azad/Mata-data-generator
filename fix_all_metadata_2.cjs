const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/MetadataGenerator');

let ml = path.join(dir, 'MetadataCardList.tsx');
let mlC = fs.readFileSync(ml, 'utf8');
mlC = mlC.replace(/c =>/g, '(c: any) =>');
fs.writeFileSync(ml, mlC);

let mg = path.join(dir, 'MetadataGrid.tsx');
let mgC = fs.readFileSync(mg, 'utf8');
mgC = mgC.replace(/k =>/g, '(k: any) =>');
mgC = mgC.replace(/prev =>/g, '(prev: any) =>');
mgC = mgC.replace(/i =>/g, '(i: any) =>');
mgC = mgC.replace(/img =>/g, '(img: any) =>');
fs.writeFileSync(mg, mgC);
