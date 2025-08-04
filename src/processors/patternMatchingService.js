// Pattern matching service for cash transactions
// Extracts the core pattern matching logic for reuse

export class PatternMatchingService {
  constructor() {
    // Define pattern matching rules
    this.rules = [
      {
        id: 1,
        name: 'INCOME',
        keywords: ['INTEREST', 'INT', 'CR.INT'],
        pattern_op: 'INCOME',
        description: 'interest income from bank deposits or investments',
        gl_account: '421025',
        ft_id: 'BANK_00041824719_0649'
      },
      {
        id: 2,
        name: 'CARD_SETTLEMENT',
        keywords: ['MASTERCARD', 'VISA'],
        pattern_op: 'SETTLEMENT',
        description: 'card settlement transaction',
        gl_account: '124001',
        ft_id: 'ACIW_US_BRAINTREE_0022'
      },
      {
        id: 3,
        name: 'PAYPAL_SETTLEMENT',
        keywords: ['PAYPAL'],
        pattern_op: 'SETTLEMENT',
        description: 'PayPal-related settlement or refund',
        gl_account: '124001',
        ft_id: 'ACIW_US_BRAINTREE_0022'
      },
      {
        id: 4,
        name: 'MISC_SETTLEMENT',
        keywords: ['MISCELLANEOUS'],
        pattern_op: 'SETTLEMENT',
        description: 'miscellaneous settlement or transfer',
        gl_account: '124001',
        ft_id: 'ACIW_US_BRAINTREE_0022'
      }
    ];
  }

  /**
   * Analyze a single transaction and return pattern matching result
   */
  analyzeTransaction(transaction) {
    const text = transaction.TEXT || transaction.text || '';
    const upperText = text.toUpperCase();
    
    // Try to match against each rule
    for (const rule of this.rules) {
      for (const keyword of rule.keywords) {
        const position = upperText.indexOf(keyword);
        if (position !== -1) {
          return {
            BT_ID: transaction.BT_ID || transaction.bt_id,
            TEXT: text,
            TRANSACTION_AMOUNT: transaction.TRANSACTION_AMOUNT || transaction.amount,
            TRANSACTION_CURRENCY: transaction.TRANSACTION_CURRENCY || transaction.currency,
            AI_SUGGEST_TEXT: rule.pattern_op,
            AI_CONFIDENCE_SCORE: '0.99',
            AI_REASON: `Applied Rule ${rule.id} (${rule.name}): Found keyword '${keyword}' at position ${position} in transaction text. This indicates ${rule.description}.`,
            AI_GL_ACCOUNT: rule.gl_account,
            AI_PRCSSR_PTRN_FT: rule.ft_id,
            UPDATED_AT: new Date().toISOString()
          };
        }
      }
    }
    
    // No match found
    return {
      BT_ID: transaction.BT_ID || transaction.bt_id,
      TEXT: text,
      TRANSACTION_AMOUNT: transaction.TRANSACTION_AMOUNT || transaction.amount,
      TRANSACTION_CURRENCY: transaction.TRANSACTION_CURRENCY || transaction.currency,
      AI_SUGGEST_TEXT: 'UNKNOWN',
      AI_CONFIDENCE_SCORE: '0.10',
      AI_REASON: 'Applied Rule 5 (NO_MATCH): No matching keywords found in transaction text. This indicates an unclassified transaction type.',
      AI_GL_ACCOUNT: null,
      AI_PRCSSR_PTRN_FT: null,
      UPDATED_AT: new Date().toISOString()
    };
  }

  /**
   * Analyze a batch of transactions
   */
  analyzeBatch(transactions) {
    return transactions.map(transaction => this.analyzeTransaction(transaction));
  }

  /**
   * Get system prompt for AI-based pattern matching
   */
  getSystemPrompt() {
    return `You are an expert at analyzing cash transactions and identifying patterns.

IMPORTANT: For the AI_REASON field, you must provide DETAILED explanations that include:
1. Which specific rule was applied (Rule 1, Rule 2, etc.)
2. The exact keyword that was found
3. The position or context where it was found
4. What this pattern indicates about the transaction type

Pattern matching rules:
${this.rules.map(rule => 
  `- Rule ${rule.id} (${rule.name}): If TEXT contains ${rule.keywords.map(k => `"${k}"`).join(' or ')} → pattern_op = "${rule.pattern_op}"`
).join('\n')}
- Rule 5 (NO_MATCH): If none of the above patterns match → pattern_op = "UNKNOWN"

For each transaction, return a JSON object with these fields:
- BT_ID: transaction ID
- TEXT: transaction text
- TRANSACTION_AMOUNT: amount
- TRANSACTION_CURRENCY: currency
- AI_SUGGEST_TEXT: pattern_op value
- AI_CONFIDENCE_SCORE: 0.99 for match, 0.10 for no match
- AI_REASON: detailed explanation following the format above
- AI_GL_ACCOUNT: GL account based on pattern
- AI_PRCSSR_PTRN_FT: processor pattern FT ID
- UPDATED_AT: current timestamp`;
  }

  /**
   * Format transactions for AI prompt
   */
  formatTransactionsForPrompt(transactions) {
    return `Analyze these ${transactions.length} transactions and apply pattern matching rules:

${transactions.map((t, i) => 
  `Transaction ${i + 1}:
- BT_ID: ${t.BT_ID}
- TEXT: ${t.TEXT}
- AMOUNT: ${t.TRANSACTION_AMOUNT}
- CURRENCY: ${t.TRANSACTION_CURRENCY}`
).join('\n\n')}

Return a JSON array with the pattern matching results for all transactions.`;
  }
}

// Export singleton instance
export const patternMatchingService = new PatternMatchingService();