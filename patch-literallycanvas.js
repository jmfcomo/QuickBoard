const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  'node_modules/literallycanvas/lib/js/literallycanvas-core.js',
);

try {
  let content = fs.readFileSync(filePath, 'utf8');
  let lines = content.split('\n');
  let patched = false;

  if (lines.length > 3407 && lines[3406].includes('requestAnimationFrame:')) {
    lines[3406] = '';
    patched = true;
    console.log('✓ Patched: removed duplicate requestAnimationFrame warning');
  } else {
    console.log('! requestAnimationFrame patch: pattern not found');
  }

  const noopLine = '    this.respondToSizeChange = function() {};';
  const bindBlock = '    if (containerEl) {\n      this.bindToElement(containerEl);\n    }';
  const brokenPattern = bindBlock + '\n' + noopLine;
  const fixedPattern = noopLine + '\n' + bindBlock;

  if (content.includes(brokenPattern)) {
    // Not yet patched — apply fix
    content = content.replace(brokenPattern, fixedPattern);
    lines = content.split('\n');
    patched = true;
    console.log('✓ Patched: fixed respondToSizeChange no-op overwrite');
  } else if (content.includes(fixedPattern)) {
    console.log('✓ respondToSizeChange patch already applied');
  } else {
    console.log('! respondToSizeChange patch: pattern not found');
  }

  if (patched) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  }
} catch (error) {
  console.error('Error patching literallycanvas:', error.message);
}
