const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules/literallycanvas/lib/js/literallycanvas-core.js');

try {
  let content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split('\n');
  
  // Find and remove line 3407 which has the first (problematic) requestAnimationFrame
  if (lines.length > 3407 && lines[3406].includes('requestAnimationFrame:')) {
    // Remove the duplicate line
    lines[3406] = '';
    content = lines.join('\n');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✓ Patched literallycanvas-core.js to fix duplicate requestAnimationFrame warning');
  } else {
    console.log('! Pattern not found in expected location');
  }
} catch (error) {
  console.error('Error patching literallycanvas:', error.message);
}
