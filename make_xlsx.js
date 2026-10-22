const XLSX = require('./js/vendor/xlsx.full.min.js');
const fs = require('fs');

const csv = fs.readFileSync('sample_fintech_legal_data.csv', 'utf8');
const wb = XLSX.read(csv, { type: 'string' });
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync('sample_fintech_legal_data.xlsx', buf);
console.log('Successfully created sample_fintech_legal_data.xlsx');
