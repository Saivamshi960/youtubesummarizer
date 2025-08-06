import { GoogleGenerativeAI } from "@google/generative-ai";

interface VideoMetadata {
  title: string;
  author: string;
}

/**
 * Generates a summary of the provided transcript using the Gemini API.
 * This function is the primary method for generating the summary.
 * @param transcript The full transcript of the video.
 * @param videoMetadata Metadata about the video (title, author).
 * @returns A promise that resolves to the summary string or null on failure.
 */
export async function generateSummary(transcript: string, videoMetadata: VideoMetadata): Promise<string | null> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY is not set in environment variables.');
    return null;
  }
  
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  // Corrected model name from "gemini-pro" to "gemini-1.5-flash-latest"
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  const prompt = `You are a helpful assistant for summarizing YouTube video transcripts. Please provide a concise summary of the following video transcript. The video is titled "${videoMetadata.title}" by "${videoMetadata.author}".

  **Instructions for the summary:**
  - Start with a single sentence that captures the main idea.
  - Follow with a bulleted list of 5-7 key takeaways or main points.
  - Do not include any introductory or concluding remarks (e.g., "Here is a summary...").

  **Video Transcript:**
  ${transcript}
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();
    return summary;
  } catch (error) {
    console.error('❌ Failed to generate summary with Gemini API:', error);
    return null;
  }
}
