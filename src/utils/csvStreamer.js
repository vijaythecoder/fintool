import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';
import path from 'path';
import { promises as fs } from 'fs';

export class CSVStreamer {
  constructor(options = {}) {
    this.outputDir = options.outputDir || './results';
    this.headers = options.headers || [
      'BT_ID',
      'TEXT',
      'TRANSACTION_AMOUNT',
      'TRANSACTION_CURRENCY',
      'AI_SUGGEST_TEXT',
      'AI_CONFIDENCE_SCORE',
      'AI_REASON',
      'AI_GL_ACCOUNT',
      'AI_PRCSSR_PTRN_FT',
      'UPDATED_AT'
    ];
    this.writeStream = null;
    this.rowCount = 0;
    this.filePath = null;
  }

  /**
   * Initialize the CSV file with headers
   */
  async initialize(filename = null) {
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });
    
    // Generate filename if not provided
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      filename = `pattern_batch_${timestamp}.csv`;
    }
    
    this.filePath = path.join(this.outputDir, filename);
    
    // Create write stream
    this.writeStream = createWriteStream(this.filePath, { encoding: 'utf8' });
    
    // Write headers
    await this.writeRow(this.headers);
    
    return this.filePath;
  }

  /**
   * Write a single row to the CSV
   */
  async writeRow(values) {
    if (!this.writeStream || this.writeStream.destroyed) {
      throw new Error('CSV stream is closed');
    }
    
    const csvLine = this.formatCSVLine(values);
    return new Promise((resolve, reject) => {
      this.writeStream.write(csvLine + '\n', (error) => {
        if (error) reject(error);
        else {
          this.rowCount++;
          resolve();
        }
      });
    });
  }

  /**
   * Write multiple rows
   */
  async writeRows(rows) {
    for (const row of rows) {
      await this.writeRow(this.extractValues(row));
    }
  }

  /**
   * Stream write for large batches
   */
  async streamWrite(dataGenerator) {
    const transform = new Transform({
      objectMode: true,
      transform: (chunk, encoding, callback) => {
        try {
          const values = this.extractValues(chunk);
          const csvLine = this.formatCSVLine(values);
          callback(null, csvLine + '\n');
          this.rowCount++;
        } catch (error) {
          callback(error);
        }
      }
    });

    await pipeline(
      Readable.from(dataGenerator),
      transform,
      this.writeStream
    );
  }

  /**
   * Extract values from object based on headers
   */
  extractValues(obj) {
    return this.headers.map(header => {
      const value = obj[header];
      return value !== null && value !== undefined ? value : '';
    });
  }

  /**
   * Format values as CSV line
   */
  formatCSVLine(values) {
    return values.map(value => {
      const str = String(value);
      // Escape quotes and wrap in quotes if contains comma, quotes, or newline
      const escaped = str.replace(/"/g, '""');
      return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
        ? `"${escaped}"`
        : escaped;
    }).join(',');
  }

  /**
   * Close the stream
   */
  async close() {
    if (this.writeStream && !this.writeStream.destroyed) {
      return new Promise((resolve, reject) => {
        this.writeStream.end((error) => {
          if (error) reject(error);
          else resolve({
            filePath: this.filePath,
            rowCount: this.rowCount - 1 // Subtract header row
          });
        });
        this.writeStream = null;
      });
    }
    return {
      filePath: this.filePath,
      rowCount: this.rowCount - 1 // Subtract header row
    };
  }

  /**
   * Create a temporary file that will be renamed when complete
   */
  async initializeTemp(baseName) {
    const tempName = `${baseName}.tmp`;
    await this.initialize(tempName);
    this.finalName = baseName;
    return this.filePath;
  }

  /**
   * Finalize temporary file
   */
  async finalize() {
    const result = await this.close();
    
    if (this.finalName && result) {
      const finalPath = path.join(this.outputDir, this.finalName);
      await fs.rename(this.filePath, finalPath);
      result.filePath = finalPath;
    }
    
    return result;
  }

  /**
   * Static method to merge multiple CSV files
   */
  static async mergeCSVFiles(filePaths, outputPath, hasHeaders = true) {
    const writeStream = createWriteStream(outputPath);
    let headerWritten = false;
    let totalRows = 0;

    for (const filePath of filePaths) {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      if (hasHeaders && !headerWritten) {
        // Write header from first file
        writeStream.write(lines[0] + '\n');
        headerWritten = true;
      }
      
      // Write data rows (skip header if present)
      const startIndex = hasHeaders ? 1 : 0;
      for (let i = startIndex; i < lines.length; i++) {
        writeStream.write(lines[i] + '\n');
        totalRows++;
      }
    }

    return new Promise((resolve, reject) => {
      writeStream.end((error) => {
        if (error) reject(error);
        else resolve({ outputPath, totalRows });
      });
    });
  }
}

// Helper function for quick CSV writing
export async function writeCSV(data, filename, options = {}) {
  const streamer = new CSVStreamer(options);
  await streamer.initialize(filename);
  await streamer.writeRows(data);
  return await streamer.close();
}