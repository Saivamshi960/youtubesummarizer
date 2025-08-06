import * as readline from 'readline';
import fs from 'fs';
import path from 'path';

interface PromptResult {
  videoUrl?: string;
  videoId?: string;
  transcript?: string;
  title?: string;
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Promisify readline question
function askQuestion(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Extract video ID from URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1] ?? null;
  }
  
  return null;
}

// Clean and format transcript text
function cleanTranscriptText(rawText: string): string {
  return rawText
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove timestamp patterns like [00:00:00] or (0:00)
    .replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g, '')
    .replace(/\(\d{1,2}:\d{2}(?::\d{2})?\)/g, '')
    // Remove speaker labels like "Speaker 1:" or "John:"
    .replace(/^[A-Za-z\s]+:\s*/gm, '')
    // Remove extra punctuation
    .replace(/[.]{2,}/g, '.')
    .replace(/[,]{2,}/g, ',')
    // Fix common transcription errors
    .replace(/\buh\b/gi, '')
    .replace(/\bum\b/gi, '')
    .replace(/\ber\b/gi, '')
    // Trim and normalize
    .trim()
    .replace(/\n\s*\n/g, '\n')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');
}

// Validate transcript quality
function validateTranscript(transcript: string): {
  isValid: boolean;
  issues: string[];
  wordCount: number;
  charCount: number;
} {
  const issues: string[] = [];
  const wordCount = transcript.split(' ').filter(word => word.length > 0).length;
  const charCount = transcript.length;
  
  // Check minimum length
  if (charCount < 100) {
    issues.push('Transcript is too short (less than 100 characters)');
  }
  
  if (wordCount < 20) {
    issues.push('Transcript has too few words (less than 20 words)');
  }
  
  // Check for excessive repetition
  const words = transcript.toLowerCase().split(' ');
  const uniqueWords = new Set(words);
  const repetitionRatio = uniqueWords.size / words.length;
  
  if (repetitionRatio < 0.3) {
    issues.push('Transcript appears to have excessive repetition');
  }
  
  // Check for meaningful content
  const meaningfulWords = words.filter(word => 
    word.length > 3 && 
    !['the', 'and', 'that', 'this', 'with', 'have', 'will', 'they', 'from', 'been'].includes(word)
  );
  
  if (meaningfulWords.length < wordCount * 0.3) {
    issues.push('Transcript may lack meaningful content');
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    wordCount,
    charCount
  };
}

// Save transcript to file
function saveTranscript(videoId: string, transcript: string, title?: string): string {
  // Create transcripts directory if it doesn't exist
  const transcriptsDir = 'transcripts';
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
  }
  
  // Create filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTitle = title ? title.replace(/[<>:"/\\|?*]/g, '-').substring(0, 50) : '';
  const filename = safeTitle 
    ? `${videoId}_${safeTitle}_${timestamp}.txt`
    : `${videoId}_manual_${timestamp}.txt`;
  
  const filepath = path.join(transcriptsDir, filename);
  
  // Create file content with metadata
  const fileContent = `# Manual Transcript
Video ID: ${videoId}
${title ? `Title: ${title}` : ''}
Created: ${new Date().toISOString()}
Word Count: ${transcript.split(' ').length}
Character Count: ${transcript.length}

---

${transcript}`;
  
  fs.writeFileSync(filepath, fileContent, 'utf8');
  return filepath;
}

// Display instructions for manual transcript extraction
function displayInstructions() {
  console.log('\n' + '='.repeat(80));
  console.log('📝 MANUAL TRANSCRIPT EXTRACTION HELPER');
  console.log('='.repeat(80));
  console.log(`
This helper will guide you through manually extracting a transcript from YouTube.

🎯 METHODS TO GET TRANSCRIPT:

1. **YouTube's Built-in Transcript** (Recommended):
   • Open the YouTube video
   • Click the "..." (More) button below the video
   • Select "Show transcript"
   • Copy all the text (Ctrl+A, then Ctrl+C)

2. **Auto-generated Captions**:
   • Turn on captions (CC button)
   • Use browser extensions to extract caption text
   • Or manually copy as you watch

3. **Third-party Tools**:
   • YouTube transcript extractors
   • Browser extensions for caption extraction
   • Online transcript generators

4. **Manual Typing**:
   • Watch the video and type key points
   • Focus on main ideas rather than word-for-word

💡 TIPS:
• Don't worry about perfect formatting - this tool will clean it up
• Include speaker names if multiple people are talking
• Timestamps will be automatically removed
• The longer and more complete, the better the AI summary will be

Press Enter to continue...`);
}

// Main interactive helper function
async function runInteractiveHelper(): Promise<void> {
  console.clear();
  displayInstructions();
  await askQuestion('');
  
  try {
    // Step 1: Get YouTube URL
    console.log('\n📹 STEP 1: YouTube Video Information');
    console.log('-'.repeat(50));
    
    const videoUrl = await askQuestion('Enter the YouTube video URL: ');
    
    if (!videoUrl) {
      console.log('❌ No URL provided. Exiting...');
      return;
    }
    
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      console.log('❌ Invalid YouTube URL format. Please check the URL and try again.');
      return;
    }
    
    console.log(`✅ Video ID extracted: ${videoId}`);
    
    // Step 2: Get optional title
    const title = await askQuestion('Enter video title (optional, press Enter to skip): ');
    
    // Step 3: Get transcript
    console.log('\n📝 STEP 2: Transcript Input');
    console.log('-'.repeat(50));
    console.log('Now paste the transcript content below.');
    console.log('You can paste multiple lines - press Enter twice when finished, or type "DONE" on a new line.\n');
    
    let transcript = '';
    let lineCount = 0;
    let emptyLineCount = 0;
    
    while (true) {
      const line = await askQuestion(`Line ${++lineCount}: `);
      
      if (line === 'DONE' || line === 'done') {
        break;
      }
      
      if (line === '') {
        emptyLineCount++;
        if (emptyLineCount >= 2) {
          break;
        }
      } else {
        emptyLineCount = 0;
      }
      
      transcript += line + '\n';
    }
    
    if (!transcript.trim()) {
      console.log('❌ No transcript content provided. Exiting...');
      return;
    }
    
    // Step 4: Clean and validate transcript
    console.log('\n🧹 STEP 3: Processing Transcript');
    console.log('-'.repeat(50));
    
    console.log('Original length:', transcript.length, 'characters');
    
    const cleanedTranscript = cleanTranscriptText(transcript);
    console.log('Cleaned length:', cleanedTranscript.length, 'characters');
    
    const validation = validateTranscript(cleanedTranscript);
    console.log(`Word count: ${validation.wordCount}`);
    console.log(`Character count: ${validation.charCount}`);
    
    if (!validation.isValid) {
      console.log('\n⚠️ QUALITY ISSUES DETECTED:');
      validation.issues.forEach(issue => console.log(`   • ${issue}`));
      
      const proceed = await askQuestion('\nDo you want to save anyway? (y/N): ');
      if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
        console.log('Operation cancelled.');
        return;
      }
    } else {
      console.log('✅ Transcript validation passed!');
    }
    
    // Step 5: Save transcript
    console.log('\n💾 STEP 4: Saving Transcript');
    console.log('-'.repeat(50));
    
    const savedPath = saveTranscript(videoId, cleanedTranscript, title || undefined);
    console.log(`✅ Transcript saved to: ${savedPath}`);
    
    // Step 6: Preview and next steps
    console.log('\n📋 PREVIEW (first 200 characters):');
    console.log('-'.repeat(50));
    console.log(cleanedTranscript.substring(0, 200) + '...');
    
    console.log('\n🎉 SUCCESS! Next steps:');
    console.log('-'.repeat(50));
    console.log('1. Run the main program to process this video');
    console.log('2. The transcript will be automatically detected and used');
    console.log('3. An AI summary will be generated using your manual transcript');
    console.log(`\nCommand: npm start -- "${videoUrl}"`);
    
  } catch (error) {
    console.error('\n❌ Error during processing:', error);
  } finally {
    rl.close();
  }
}

// Batch helper for multiple transcripts
async function runBatchHelper(): Promise<void> {
  console.log('\n📚 BATCH TRANSCRIPT HELPER');
  console.log('='.repeat(50));
  console.log('This mode helps you process multiple video transcripts at once.\n');
  
  const transcriptsDir = 'transcripts';
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
  }
  
  console.log(`Instructions:
1. Place your transcript files in the "${transcriptsDir}" directory
2. Name them as: [videoId].txt or [videoId]_transcript.txt
3. This helper will validate and clean them all
`);
  
  const files = fs.readdirSync(transcriptsDir).filter(f => f.endsWith('.txt'));
  
  if (files.length === 0) {
    console.log(`No .txt files found in ${transcriptsDir} directory.`);
    return;
  }
  
  console.log(`Found ${files.length} transcript files:`);
  files.forEach(file => console.log(`  • ${file}`));
  
  const proceed = await askQuestion('\nProcess all files? (y/N): ');
  if (proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
    return;
  }
  
  let processed = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      console.log(`\nProcessing: ${file}`);
      const filepath = path.join(transcriptsDir, file);
      const content = fs.readFileSync(filepath, 'utf8');
      
      const cleaned = cleanTranscriptText(content);
      const validation = validateTranscript(cleaned);
      
      console.log(`  Word count: ${validation.wordCount}`);
      console.log(`  Character count: ${validation.charCount}`);
      
      if (!validation.isValid) {
        console.log(`  ⚠️ Issues: ${validation.issues.join(', ')}`);
      } else {
        console.log('  ✅ Validation passed');
      }
      
      // Save cleaned version
      const cleanedPath = filepath.replace('.txt', '_cleaned.txt');
      fs.writeFileSync(cleanedPath, cleaned, 'utf8');
      console.log(`  💾 Cleaned version saved: ${path.basename(cleanedPath)}`);
      
      processed++;
    } catch (error) {
      console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      errors++;
    }
  }
  
  console.log(`\n🎉 Batch processing complete!`);
  console.log(`✅ Processed: ${processed} files`);
  console.log(`❌ Errors: ${errors} files`);
  
  rl.close();
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--batch')) {
    await runBatchHelper();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Manual Transcript Helper

Usage:
  npm run manual-helper          # Interactive single transcript helper
  npm run manual-helper --batch  # Batch process multiple transcripts
  npm run manual-helper --help   # Show this help

This tool helps you manually add transcripts for YouTube videos
when automatic extraction fails.
`);
  } else {
    await runInteractiveHelper();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { cleanTranscriptText, validateTranscript, saveTranscript, extractVideoId };