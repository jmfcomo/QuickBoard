const fs = require('fs');
const path = require('path');

const filePath = path.join(
  __dirname,
  'node_modules/literallycanvas/lib/js/literallycanvas-core.js'
);
const capacitorCordovaHeaderPath = path.join(
  __dirname,
  'node_modules/@capacitor/ios/CapacitorCordova/CapacitorCordova/Classes/Public/CDVWebViewProcessPoolFactory.h'
);
const capacitorCordovaUmbrellaHeaderPath = path.join(
  __dirname,
  'node_modules/@capacitor/ios/CapacitorCordova/CapacitorCordova/CapacitorCordova.h'
);

try {
  let content = fs.readFileSync(filePath, 'utf8');
  let patched = false;

  const duplicateRafAssign =
    '  requestAnimationFrame: (window.requestAnimationFrame || window.setTimeout).bind(window),\n';

  if (content.includes(duplicateRafAssign)) {
    content = content.replace(duplicateRafAssign, '');
    patched = true;
    console.log('✓ Patched: removed duplicate requestAnimationFrame warning');
  } else {
    console.log('✓ requestAnimationFrame patch already applied');
  }

  const noopLine = '    this.respondToSizeChange = function() {};';
  const bindBlock = '    if (containerEl) {\n      this.bindToElement(containerEl);\n    }';
  const brokenPattern = bindBlock + '\n' + noopLine;
  const fixedPattern = noopLine + '\n' + bindBlock;

  if (content.includes(brokenPattern)) {
    // Not yet patched — apply fix
    content = content.replace(brokenPattern, fixedPattern);
    patched = true;
    console.log('✓ Patched: fixed respondToSizeChange no-op overwrite');
  } else if (content.includes(fixedPattern)) {
    console.log('✓ respondToSizeChange patch already applied');
  } else {
    console.log('! respondToSizeChange patch: pattern not found');
  }

  if (patched) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
} catch (error) {
  console.error('Error patching literallycanvas:', error.message);
}

try {
  let content = fs.readFileSync(capacitorCordovaHeaderPath, 'utf8');
  const oldCordovaImport = '#import <Cordova/CDVAvailabilityDeprecated.h>';
  const localImport = '#import "CDVAvailabilityDeprecated.h"';
  const macroBlock =
    '#ifndef CDV_DEPRECATED\n' +
    '#define CDV_DEPRECATED(version, msg) __attribute__((deprecated("Deprecated in Cordova " #version ". " msg)))\n' +
    '#endif';

  if (content.includes(oldCordovaImport)) {
    content = content.replace(oldCordovaImport, macroBlock);
    fs.writeFileSync(capacitorCordovaHeaderPath, content, 'utf8');
    console.log('✓ Patched: fixed CapacitorCordova deprecated availability header include');
  } else if (content.includes(localImport)) {
    content = content.replace(localImport, macroBlock);
    fs.writeFileSync(capacitorCordovaHeaderPath, content, 'utf8');
    console.log('✓ Patched: replaced CapacitorCordova local include with inline deprecation macro');
  } else if (content.includes('#ifndef CDV_DEPRECATED')) {
    console.log('✓ CapacitorCordova header include patch already applied');
  } else {
    console.log('! CapacitorCordova header include patch: pattern not found');
  }
} catch (error) {
  console.error('Error patching CapacitorCordova header:', error.message);
}

try {
  let content = fs.readFileSync(capacitorCordovaUmbrellaHeaderPath, 'utf8');
  const oldImport = '#import <Cordova/CDVAvailabilityDeprecated.h>';
  const macroBlock =
    '#ifndef CDV_DEPRECATED\n' +
    '#define CDV_DEPRECATED(version, msg) __attribute__((deprecated("Deprecated in Cordova " #version ". " msg)))\n' +
    '#endif';

  if (content.includes(oldImport)) {
    content = content.replace(oldImport, macroBlock);
    fs.writeFileSync(capacitorCordovaUmbrellaHeaderPath, content, 'utf8');
    console.log('✓ Patched: fixed CapacitorCordova umbrella deprecated header include');
  } else if (content.includes('#ifndef CDV_DEPRECATED')) {
    console.log('✓ CapacitorCordova umbrella header patch already applied');
  } else {
    console.log('! CapacitorCordova umbrella patch: pattern not found');
  }
} catch (error) {
  console.error('Error patching CapacitorCordova umbrella header:', error.message);
}
