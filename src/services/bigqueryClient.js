import { BigQuery } from '@google-cloud/bigquery';
import { logger } from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize BigQuery client
let bigqueryClient = null;

export function getBigQueryClient() {
  if (!bigqueryClient) {
    const options = {
      projectId: process.env.GCP_PROJECT_ID,
      keyFilename: process.env.GCP_KEY_FILE_PATH,
      location: process.env.GCP_LOCATION || 'us'
    };
    
    logger.info('Initializing BigQuery client with project:', options.projectId);
    bigqueryClient = new BigQuery(options);
  }
  
  return bigqueryClient;
}

export async function queryBigQuery(query) {
  try {
    const bigquery = getBigQueryClient();
    logger.debug(`Executing BigQuery query: ${query.substring(0, 100)}...`);
    
    const [job] = await bigquery.createQueryJob({
      query,
      location: process.env.GCP_LOCATION || 'us'
    });
    
    const [rows] = await job.getQueryResults();
    return rows;
    
  } catch (error) {
    logger.error('BigQuery query failed:', error);
    throw error;
  }
}

export async function updateBigQuery(query) {
  try {
    const bigquery = getBigQueryClient();
    logger.debug(`Executing BigQuery update: ${query.substring(0, 100)}...`);
    
    const [job] = await bigquery.createQueryJob({
      query,
      location: process.env.GCP_LOCATION || 'us'
    });
    
    await job.getQueryResults();
    return { success: true };
    
  } catch (error) {
    logger.error('BigQuery update failed:', error);
    throw error;
  }
}