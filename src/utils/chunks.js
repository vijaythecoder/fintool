export function* chunks(array, size) {
  for (let i = 0; i < array.length; i += size) {
    yield array.slice(i, i + size);
  }
}

export function createBatches(items, batchSize = 100) {
  return Array.from(chunks(items, batchSize));
}

export async function processBatches(items, batchSize, processor, options = {}) {
  const { 
    concurrency = 1, 
    onProgress = () => {}, 
    onError = () => {} 
  } = options;
  
  const batches = createBatches(items, batchSize);
  const results = [];
  let processed = 0;
  
  async function processBatch(batch, index) {
    try {
      const result = await processor(batch, index);
      processed += batch.length;
      onProgress(processed, items.length);
      return result;
    } catch (error) {
      onError(error, batch, index);
      throw error;
    }
  }
  
  if (concurrency === 1) {
    for (let i = 0; i < batches.length; i++) {
      const result = await processBatch(batches[i], i);
      results.push(result);
    }
  } else {
    const promises = [];
    
    for (let i = 0; i < batches.length; i++) {
      if (promises.length >= concurrency) {
        const result = await Promise.race(promises);
        results.push(result);
        promises.splice(promises.findIndex(p => p === result), 1);
      }
      
      promises.push(processBatch(batches[i], i));
    }
    
    const remainingResults = await Promise.all(promises);
    results.push(...remainingResults);
  }
  
  return results.flat();
}

export function groupBy(array, keyFn) {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
}

export function partition(array, predicateFn) {
  const truthy = [];
  const falsy = [];
  
  for (const item of array) {
    if (predicateFn(item)) {
      truthy.push(item);
    } else {
      falsy.push(item);
    }
  }
  
  return [truthy, falsy];
}

export function calculateBatchMetrics(totalItems, batchSize, processingTimeMs) {
  const totalBatches = Math.ceil(totalItems / batchSize);
  const avgTimePerBatch = processingTimeMs / totalBatches;
  const avgTimePerItem = processingTimeMs / totalItems;
  const itemsPerSecond = totalItems / (processingTimeMs / 1000);
  
  return {
    totalItems,
    batchSize,
    totalBatches,
    processingTimeMs,
    avgTimePerBatch,
    avgTimePerItem,
    itemsPerSecond,
    estimatedTimeForNextRun: (nextItems) => (nextItems / itemsPerSecond) * 1000
  };
}