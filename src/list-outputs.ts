import fs from 'fs';
import path from 'path';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  modified: Date;
  type: 'transcript' | 'summary' | 'report' | 'sample' | 'manual' | 'other';
  videoId?: string | undefined;
}

interface DirectoryStats {
  totalFiles: number;
  totalSize: number;
  totalSizeFormatted: string;
  filesByType: Record<string, number>;
  oldestFile?: Date;
  newestFile?: Date;
}

// Format file size in human-readable format
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  
  return `${size.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

// Determine file type based on path and name
function determineFileType(filePath: string, fileName: string): FileInfo['type'] {
  const dir = path.dirname(filePath);
  const baseName = fileName.toLowerCase();
  
  if (dir.includes('transcripts')) {
    if (baseName.includes('manual') || baseName.includes('cleaned')) {
      return 'manual';
    }
    return 'transcript';
  }
  
  if (dir.includes('summaries')) return 'summary';
  if (dir.includes('reports')) return 'report';
  if (dir.includes('samples')) return 'sample';
  
  return 'other';
}

// Extract video ID from filename
function extractVideoIdFromFilename(fileName: string): string | undefined {
  // Try various patterns
  const patterns = [
    /^([a-zA-Z0-9_-]{11})_/,  // Standard YouTube ID at start
    /_([a-zA-Z0-9_-]{11})_/,  // YouTube ID in middle
    /([a-zA-Z0-9_-]{11})\./   // YouTube ID before extension
  ];
  
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) return match[1];
  }
  
  return undefined;
}

// Get file information
function getFileInfo(filePath: string): FileInfo {
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  
  return {
    name: fileName,
    path: filePath,
    size: stats.size,
    sizeFormatted: formatFileSize(stats.size),
    modified: stats.mtime,
    type: determineFileType(filePath, fileName),
    videoId: extractVideoIdFromFilename(fileName)
  };
}

// Scan directory recursively for files
function scanDirectory(dirPath: string, files: FileInfo[] = []): FileInfo[] {
  if (!fs.existsSync(dirPath)) {
    return files;
  }
  
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stats = fs.statSync(fullPath);
    
    if (stats.isDirectory()) {
      scanDirectory(fullPath, files);
    } else if (stats.isFile()) {
      files.push(getFileInfo(fullPath));
    }
  }
  
  return files;
}

// Calculate directory statistics
function calculateStats(files: FileInfo[]): DirectoryStats {
  const stats: DirectoryStats = {
    totalFiles: files.length,
    totalSize: 0,
    totalSizeFormatted: '',
    filesByType: {}
  };
  
  const dates: Date[] = [];
  
  for (const file of files) {
    stats.totalSize += file.size;
    dates.push(file.modified);
    
    stats.filesByType[file.type] = (stats.filesByType[file.type] || 0) + 1;
  }
  
  stats.totalSizeFormatted = formatFileSize(stats.totalSize);
  
  if (dates.length > 0) {
    stats.oldestFile = new Date(Math.min(...dates.map(d => d.getTime())));
    stats.newestFile = new Date(Math.max(...dates.map(d => d.getTime())));
  }
  
  return stats;
}

// Group files by video ID
function groupFilesByVideo(files: FileInfo[]): Map<string, FileInfo[]> {
  const groups = new Map<string, FileInfo[]>();
  
  for (const file of files) {
    const key = file.videoId || 'unknown';
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    
    groups.get(key)!.push(file);
  }
  
  return groups;
}

// Display files in a formatted table
function displayFilesTable(files: FileInfo[], title: string) {
  console.log(`\n${title}`);
  console.log('='.repeat(title.length));
  
  if (files.length === 0) {
    console.log('No files found.');
    return;
  }
  
  // Sort by modification date (newest first)
  const sortedFiles = [...files].sort((a, b) => b.modified.getTime() - a.modified.getTime());
  
  console.log('\n📁 Files:');
  console.log('-'.repeat(80));
  
  sortedFiles.forEach((file, index) => {
    const typeEmoji = {
      transcript: '📄',
      summary: '📋',
      report: '📊',
      sample: '🎯',
      manual: '✍️',
      other: '📎'
    }[file.type];
    
    const relativeTime = getRelativeTime(file.modified);
    
    console.log(`${typeEmoji} ${file.name}`);
    console.log(`   📁 ${file.path}`);
    console.log(`   📏 ${file.sizeFormatted} • 🕒 ${relativeTime}`);
    if (file.videoId) {
      console.log(`   🎬 Video ID: ${file.videoId}`);
    }
    
    if (index < sortedFiles.length - 1) {
      console.log('');
    }
  });
}

// Get relative time string
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
}

// Display statistics
function displayStats(stats: DirectoryStats) {
  console.log('\n📊 STATISTICS');
  console.log('='.repeat(20));
  console.log(`Total files: ${stats.totalFiles}`);
  console.log(`Total size: ${stats.totalSizeFormatted}`);
  
  if (stats.oldestFile && stats.newestFile) {
    console.log(`Date range: ${stats.oldestFile.toLocaleDateString()} - ${stats.newestFile.toLocaleDateString()}`);
  }
  
  console.log('\n📈 Files by type:');
  Object.entries(stats.filesByType)
    .sort(([,a], [,b]) => b - a)
    .forEach(([type, count]) => {
      const emoji = {
        transcript: '📄',
        summary: '📋',
        report: '📊',
        sample: '🎯',
        manual: '✍️',
        other: '📎'
      }[type] || '📎';
      
      console.log(`   ${emoji} ${type}: ${count}`);
    });
}

// Display files grouped by video
function displayByVideo(files: FileInfo[]) {
  const groups = groupFilesByVideo(files);
  
  console.log('\n🎬 FILES BY VIDEO');
  console.log('='.repeat(30));
  
  const sortedGroups = Array.from(groups.entries())
    .sort(([,a], [,b]) => {
      const latestA = Math.max(...a.map(f => f.modified.getTime()));
      const latestB = Math.max(...b.map(f => f.modified.getTime()));
      return latestB - latestA;
    });
  
  for (const [videoId, groupFiles] of sortedGroups) {
    console.log(`\n🎬 ${videoId === 'unknown' ? 'Unknown Video ID' : `Video ID: ${videoId}`}`);
    console.log('-'.repeat(50));
    
    const typeStats = groupFiles.reduce((acc, file) => {
      acc[file.type] = (acc[file.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const typeList = Object.entries(typeStats)
      .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
      .join(', ');
    
    console.log(`   📊 Files: ${groupFiles.length} (${typeList})`);
    console.log(`   📏 Total size: ${formatFileSize(groupFiles.reduce((sum, f) => sum + f.size, 0))}`);
    
    const latestFile = groupFiles.reduce((latest, file) => 
      file.modified > latest.modified ? file : latest
    );
    console.log(`   🕒 Latest: ${getRelativeTime(latestFile.modified)}`);
    
    // Show individual files
    groupFiles
      .sort((a, b) => b.modified.getTime() - a.modified.getTime())
      .forEach(file => {
        const typeEmoji = {
          transcript: '📄',
          summary: '📋',
          report: '📊',
          sample: '🎯',
          manual: '✍️',
          other: '📎'
        }[file.type];
        
        console.log(`     ${typeEmoji} ${file.name} (${file.sizeFormatted})`);
      });
  }
}

// Main function
async function main() {
  console.log('📁 YouTube Summarizer - Output Files');
  console.log('='.repeat(40));
  
  const outputDirectories = ['outputs', 'transcripts'];
  let allFiles: FileInfo[] = [];
  
  // Scan all output directories
  for (const dir of outputDirectories) {
    const files = scanDirectory(dir);
    allFiles = allFiles.concat(files);
  }
  
  if (allFiles.length === 0) {
    console.log('\n❌ No output files found!');
    console.log('\n💡 Make sure to run the summarizer first:');
    console.log('   npm start');
    console.log('\n📁 Expected directories:');
    console.log('   • outputs/transcripts/');
    console.log('   • outputs/summaries/');
    console.log('   • outputs/reports/');
    console.log('   • transcripts/');
    return;
  }
  
  // Calculate and display statistics
  const stats = calculateStats(allFiles);
  displayStats(stats);
  
  // Show recent files
  const recentFiles = allFiles
    .sort((a, b) => b.modified.getTime() - a.modified.getTime())
    .slice(0, 10);
  
  displayFilesTable(recentFiles, '📅 RECENT FILES (Last 10)');
  
  // Show files grouped by video
  displayByVideo(allFiles);
  
  // Show cleanup suggestions if there are many files
  if (allFiles.length > 20) {
    console.log('\n🧹 CLEANUP SUGGESTIONS');
    console.log('='.repeat(30));
    console.log(`You have ${allFiles.length} output files using ${stats.totalSizeFormatted} of storage.`);
    console.log('\nConsider cleaning up old files:');
    
    const oldFiles = allFiles.filter(f => {
      const daysSinceModified = (Date.now() - f.modified.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceModified > 30;
    });
    
    if (oldFiles.length > 0) {
      console.log(`   • ${oldFiles.length} files older than 30 days`);
      console.log(`   • Would free up: ${formatFileSize(oldFiles.reduce((sum, f) => sum + f.size, 0))}`);
    }
  }
  
  console.log('\n✅ File listing complete!');
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}