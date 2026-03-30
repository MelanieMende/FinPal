const fs = require('fs');
const { PDFParse } = require('pdf-parse');

async function dump() {
    try {
        const filePath = 'C:/Users/melan/OneDrive/Desktop/FinPal Import/pb1762171792759593144419759693.pdf';
        const dataBuffer = fs.readFileSync(filePath);
        const parser = new PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        console.log('--- START PDF TEXT ---');
        console.log(result.text);
        console.log('--- END PDF TEXT ---');
    } catch (e) {
        console.error('Error:', e);
    }
}

dump();
