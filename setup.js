#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up YouTube Summarizer...\n');

// Create required directories
const directories = [
  'outputs',
  'outputs/transcripts',
  'outputs/summaries',
  'outputs/reports',
  'outputs/samples',
  'transcripts'
];

console.log('📁 Creating directories...');
directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`   ✅ Created: ${dir}/`);
    
    // Create .gitkeep files to preserve empty directories
    const gitkeepPath = path.join(dir, '.gitkeep');
    fs.writeFileSync(gitkeepPath, '# This file keeps the directory in git\n');
  } else {
    console.log(`   ⏭️  Already exists: ${dir}/`);
  }
});

// Check .env file
console.log('\n🔑 Checking environment file...');
if (fs.existsSync('.env')) {
  console.log('   ✅ .env file exists');
  
  // Check if required keys are present
  const envContent = fs.readFileSync('.env', 'utf8');
  const requiredKeys = ['GEMINI_API_KEY'];
  const optionalKeys = ['DEEPGRAM_API_KEY', 'OPENAI_API_KEY'];
  
  console.log('\n🔍 Checking API keys...');
  requiredKeys.forEach(key => {
    if (envContent.includes(key) && !envContent.includes(`${key}=`) && envContent.match(new RegExp(`${key}=.+`))) {
      console.log(`   ✅ ${key} is configured`);
    } else {
      console.log(`   ⚠️  ${key} needs to be configured`);
    }
  });
  
  optionalKeys.forEach(key => {
    if (envContent.includes(key) && envContent.match(new RegExp(`${key}=.+`))) {
      console.log(`   ✅ ${key} is configured (optional)`);
    } else {
      console.log(`   ⏭️  ${key} not configured (optional)`);
    }
  });

} else {
  console.log('   ❌ .env file not found');
  console.log('\n📝 Creating sample .env file...');
  
  const sampleEnv = `# Required API Keys
GEMINI_API_KEY=your_gemini_api_key_here

# Optional API Keys (for fallback methods)
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# Configuration
KEEP_AUDIO=false
DEFAULT_SUMMARY_STYLE=detailed
MAX_TRANSCRIPT_LENGTH=50000
`;
  
  fs.writeFileSync('.env', sampleEnv);
  console.log('   ✅ Created .env template');
  console.log('   📝 Please edit .env and add your API keys');
}

// Check package.json scripts
console.log('\n📦 Checking package.json...');
if (fs.existsSync('package.json')) {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  const requiredScripts = {
    'start': 'ts-node index.ts',
    'build': 'tsc',
    'dev': 'ts-node --watch index.ts',
    'manual-helper': 'ts-node manual-transcript-helper.ts',
    'list-outputs': 'ts-node list-outputs.ts',
    'clean': 'rimraf dist',
    'setup': 'node setup.js'
  };
  
  let needsUpdate = false;
  for (const [script, command] of Object.entries(requiredScripts)) {
    if (!packageJson.scripts || packageJson.scripts[script] !== command) {
      needsUpdate = true;
      break;
    }
  }
  
  if (needsUpdate) {
    console.log('   🔄 Updating package.json scripts...');
    packageJson.scripts = { ...packageJson.scripts, ...requiredScripts };
    fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
    console.log('   ✅ Package.json updated');
  } else {
    console.log('   ✅ Package.json scripts are up to date');
  }
} else {
  console.log('   ❌ package.json not found');
}

// Check TypeScript config
console.log('\n⚙️  Checking TypeScript configuration...');
if (fs.existsSync('tsconfig.json')) {
  console.log('   ✅ tsconfig.json exists');
} else {
  console.log('   ⚠️  tsconfig.json not found - TypeScript may not work properly');
}

// Check for required dependencies
console.log('\n📚 Checking dependencies...');
if (fs.existsSync('node_modules')) {
  console.log('   ✅ node_modules exists');
  
  const requiredDeps = [
    '@google/generative-ai',
    '@distube/ytdl-core', 
    'axios',
    'dotenv',
    'openai',
    '@deepgram/sdk'
  ];
  
  const devDeps = [
    'typescript',
    'ts-node',
    '@types/node'
  ];
  
  console.log('   🔍 Checking required packages...');
  requiredDeps.forEach(dep => {
    try {
      require.resolve(dep);
      console.log(`   ✅ ${dep}`);
    } catch (e) {
      console.log(`   ❌ ${dep} - please run: npm install ${dep}`);
    }
  });
  
} else {
  console.log('   ❌ node_modules not found');
  console.log('   💡 Run: npm install');
}

// Final setup report
console.log('\n' + '='.repeat(50));
console.log('🎉 SETUP COMPLETE!');
console.log('='.repeat(50));

console.log('\n✅ What was set up:');
console.log('   📁 Created all required directories');
console.log('   🔑 Checked .env configuration');  
console.log('   📦 Verified package.json');
console.log('   📚 Checked dependencies');

console.log('\n🚀 Next steps:');
console.log('   1. Configure your API keys in .env file');
console.log('   2. Run: npm install (if not done already)');
console.log('   3. Test with: npm start');

console.log('\n📖 Available commands:');
console.log('   npm start              - Process a YouTube video');
console.log('   npm run manual-helper  - Add manual transcripts');
console.log('   npm run list-outputs   - View generated files');
console.log('   npm run dev            - Development mode with watch');
console.log('   npm run build          - Build for production');

console.log('\n💡 Need help?');
console.log('   • Check the README.md file');
console.log('   • Ensure your API keys are correctly configured');
console.log('   • Try a different YouTube video if one fails');

console.log('\n🎯 Example usage:');
console.log('   npm start');
console.log('   # Then edit the youtubeUrl in index.ts');

console.log('\n' + '='.repeat(50));