import { createClient } from '@deepgram/sdk';
import ytdl from '@distube/ytdl-core';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const fsPromises = fs.promises;
const execPromise = promisify(exec);

// Define the return type for our function
interface TranscriptResult {
  transcript: string | null;
  speakers?: string[] | undefined;
  method: 'deepgram' | 'youtube-captions-ydlp';
  confidence?: number | undefined;
  metadata?: {
    title?: string;
    author?: string;
    duration?: number;
  } | undefined;
}

/**
 * Executes the yt-dlp command to download and clean a transcript file.
 * @param youtubeUrl The URL of the YouTube video.
 * @param videoId The ID of the YouTube video.
 * @returns A promise that resolves with the cleaned transcript string or null.
 */
async function downloadAndCleanYtDlpTranscript(youtubeUrl: string, videoId: string): Promise<string | null> {
  const tempVttBaseName = path.join('transcripts', videoId);
  const tempVttFile = `${tempVttBaseName}.en.vtt`;

  try {
    console.log('⬇️ Starting transcript download from YouTube using yt-dlp...');

    // Command to download auto-generated English subtitles in VTT format.
    const command = `yt-dlp --write-auto-sub --sub-lang en --skip-download -o "${tempVttBaseName}.%(ext)s" "${youtubeUrl}"`;

    await execPromise(command);
    console.log(`✅ Download command finished.`);

    // Add a short delay to ensure the file is fully written to disk.
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`🧼 Reading and cleaning file: ${tempVttFile}`);
    
    const vttContent = await fsPromises.readFile(tempVttFile, 'utf-8');
    const lines = vttContent.split(/\r?\n/);
    const textLines: string[] = [];

    for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (
            !trimmedLine ||
            trimmedLine.startsWith('WEBVTT') ||
            trimmedLine.startsWith('Kind:') ||
            trimmedLine.startsWith('Language:') ||
            trimmedLine.includes('-->') ||
            /^\d+$/.test(trimmedLine)
        ) {
            continue;
        }

        const cleanLine = trimmedLine.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '').trim();
        
        if (cleanLine) {
            textLines.push(cleanLine);
        }
    }

    const fullParagraph = [...new Set(textLines)].join(' ');
    
    if (fullParagraph.length > 0) {
      console.log('✅ Successfully extracted and cleaned transcript with yt-dlp.');
      return fullParagraph;
    } else {
      console.log('❌ yt-dlp returned an empty or unparseable transcript.');
      return null;
    }

  } catch (error: any) {
    console.error('❌ Error in yt-dlp transcription method:', error);
    if (error.stderr && error.stderr.includes('command not found')) {
        console.error('🔧 TROUBLESHOOTING TIP: It seems `yt-dlp` is not installed or not in your system\'s PATH. Please install it to use this method.');
    }
    return null;
  } finally {
    // Always clean up the temporary VTT file.
    safeDeleteFile(tempVttFile);
  }
}

/**
 * Ensures the transcripts directory exists
 */
function ensureTranscriptsDirectory(): void {
  const transcriptsDir = path.join(process.cwd(), 'transcripts');
  if (!fs.existsSync(transcriptsDir)) {
    fs.mkdirSync(transcriptsDir, { recursive: true });
  }
}

/**
 * Safely deletes a file if it exists
 */
function safeDeleteFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Cleaned up temporary file: ${filePath}`);
    }
  } catch (error) {
    console.warn(`⚠️ Could not delete temporary file ${filePath}:`, error);
  }
}

/**
 * Downloads audio from YouTube video
 */
async function downloadAudio(youtubeUrl: string, audioFilePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const audioStream = fs.createWriteStream(audioFilePath);
      const downloadStream = ytdl(youtubeUrl, {
        quality: 'highestaudio',
        filter: 'audioonly'
      });

      downloadStream.pipe(audioStream);

      downloadStream.on('end', () => {
        console.log('✅ Audio download complete.');
        resolve();
      });

      downloadStream.on('error', (err: any) => {
        console.error('❌ Download stream error:', err);
        reject(err);
      });

      audioStream.on('error', (err: any) => {
        console.error('❌ Audio stream error:', err);
        reject(err);
      });

      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        downloadStream.destroy();
        audioStream.destroy();
        reject(new Error('Download timeout after 5 minutes'));
      }, 5 * 60 * 1000); // 5 minutes

      downloadStream.on('end', () => clearTimeout(timeout));
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Extracts the transcript from a YouTube video. It first tries to use auto-generated
 * captions and falls back to Deepgram transcription if captions are not available.
 * @param youtubeUrl The full URL of the YouTube video.
 * @param videoId The ID of the YouTube video.
 * @returns A promise that resolves to a TranscriptResult object.
 */
export async function extractTranscript(youtubeUrl: string, videoId: string): Promise<TranscriptResult> {
  // Validate inputs
  if (!youtubeUrl || !videoId) {
    throw new Error('Both youtubeUrl and videoId are required parameters.');
  }

  // METHOD 1: Try to get auto-generated YouTube captions first via yt-dlp
  const ytDlpTranscript = await downloadAndCleanYtDlpTranscript(youtubeUrl, videoId);
  
  if (ytDlpTranscript) {
    let metadata;
    try {
        const videoInfo = await ytdl.getInfo(youtubeUrl);
        metadata = {
          title: videoInfo.videoDetails.title,
          author: videoInfo.videoDetails.author.name,
          duration: parseInt(videoInfo.videoDetails.lengthSeconds, 10),
        };
    } catch (err) {
        console.warn('⚠️ Could not fetch video metadata from ytdl-core:', err);
        metadata = undefined;
    }

    return {
        transcript: ytDlpTranscript,
        method: 'youtube-captions-ydlp',
        confidence: undefined,
        speakers: undefined,
        metadata: metadata,
    };
  }
  
  // METHOD 2: If YouTube captions fail, fall back to Deepgram
  console.log('🎯 Falling back to Deepgram transcription...');

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    throw new Error('DEEPGRAM_API_KEY is not set in environment variables.');
  }

  const deepgramClient = createClient(deepgramApiKey);
  ensureTranscriptsDirectory();
  const audioFilePath = path.join('transcripts', `${videoId}.mp4`);

  try {
    // Get video metadata first
    console.log('📊 Fetching video metadata...');
    const videoInfo = await ytdl.getInfo(youtubeUrl);
    
    const metadata = {
      title: videoInfo.videoDetails.title,
      author: videoInfo.videoDetails.author.name,
      duration: parseInt(videoInfo.videoDetails.lengthSeconds, 10),
    };

    // Check if suitable audio format exists
    const audioFormat = ytdl.chooseFormat(videoInfo.formats, {
      quality: 'highestaudio',
      filter: 'audioonly'
    });

    if (!audioFormat) {
      throw new Error('No suitable audio format found for the video.');
    }

    // Download audio
    console.log('⬇️ Downloading video audio...');
    await downloadAudio(youtubeUrl, audioFilePath);

    // Transcribe the downloaded audio file with Deepgram
    console.log('🎙️ Transcribing audio with Deepgram...');
    const audioFileBuffer = fs.readFileSync(audioFilePath);

    const { result, error } = await deepgramClient.listen.prerecorded.transcribeFile(
      audioFileBuffer,
      {
        model: 'nova-2',
        language: 'en-US',
        punctuate: true,
        paragraphs: true,
        utterances: true,
        diarize: true,
        filler_words: true,
      }
    );

    if (error) {
      throw new Error(`Deepgram API error: ${error.message}`);
    }

    const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? null;
    const confidence = result?.results?.channels?.[0]?.alternatives?.[0]?.confidence;

    // Extract unique speakers
    const speakers = result?.results?.utterances
      ?.map(utterance => String(utterance.speaker))
      .filter(speaker => speaker !== 'undefined' && speaker !== 'null');
    
    const uniqueSpeakers = speakers && speakers.length > 0 
      ? [...new Set(speakers)] 
      : undefined;

    // Clean up temporary file
    safeDeleteFile(audioFilePath);

    console.log('✅ Successfully transcribed with Deepgram.');
    return {
      transcript,
      method: 'deepgram',
      confidence,
      speakers: uniqueSpeakers,
      metadata,
    };

  } catch (error) {
    console.error('❌ Error in extractTranscript:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('Could not extract functions') || 
          error.message.includes('Video unavailable')) {
        console.error('\n🔧 TROUBLESHOOTING TIP: This error suggests issues with YouTube API changes. Try:');
        console.error('   1. Updating @distube/ytdl-core to the latest version');
        console.error('   2. Using a different ytdl fork like "ytdl-core-discord"');
        console.error('   3. Checking if the video is publicly accessible');
      }
      
      if (error.message.includes('403') || error.message.includes('429')) {
        console.error('\n🔧 TROUBLESHOOTING TIP: Rate limiting detected. Consider:');
        console.error('   1. Adding delays between requests');
        console.error('   2. Using a proxy or VPN');
        console.error('   3. Implementing retry logic with exponential backoff');
      }
    }

    // Always clean up temporary files on error
    safeDeleteFile(audioFilePath);

    return {
      transcript: null,
      method: 'deepgram',
      confidence: undefined,
      speakers: undefined,
      metadata: undefined,
    };
  }
}
