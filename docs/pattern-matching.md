# Step 1: Transaction Analysis
This table has cash transactions for which Pattern is Not Found, hence the column pattern is marked as 'T_NOTFOUND'.
Text column on each record will help in determining the pattern (such as SETTLEMENT, TOPUP, FOREX etc).
BT_ID is the unique column for each record.
Columns to be passed to LLM - bt_id, customer_account_number, type_code, text (BT_ID should be carried through all the steps as it is the primary key).

```sql
SELECT * FROM `ksingamsetty-test.AI_POC.cash_transactions`;
```

## Step 2: Pattern Identification
Using pattern_search column from this table, search for similar patterns in the text field (step 1) to determine the pattern_op.
Columns can be limited to customer_account_number, type_code, pattern_search, pattern_op.
Output of this step is to identify the pattern_op.
customer_account_number, type_code can also be used to refer the existing patterns for each customer_account_number.

SELECT necessary columns FROM `ksingamsetty-test.AI_POC.cash_processor_patterns`;

## Step 3: GL Account Determination
Once the above pattern_op is determined, this table needs to be used to determine the gl_account that should be assigned to a transaction.
pattern_op from step 2 = pattern in cash_gl_patterns table, and also consider customer_account_number, type_code in determining the output columns GL_ACCOUNT and FT_ID.

SELECT necessary columns FROM `ksingamsetty-test.AI_POC.cash_gl_patterns`;

## Step 4: Results Storage
Write all the results to csv file. Ensure below columns are updated:
- **AI_SUGGEST_TEXT** - this is the column where the pattern needs to be captured
- **AI_CONFIDENCE_SCORE** - Confidence score on the determination
- **AI_REASON** - Describe the reasoning on how the pattern is determined
- **AI_GL_ACCOUNT** - GL_ACCOUNT determined from step 3
- **AI_PRCSSR_PTRN_FT** - this is mapped from the FT_ID determined in step 3
- **UPDATED_AT** - When this record is written to the table

BT_ID,TEXT,TRANSACTION_AMOUNT,TRANSACTION_CURRENCY,AI_SUGGEST_TEXT,AI_CONFIDENCE_SCORE,AI_REASON,AI_GL_ACCOUNT,AI_PRCSSR_PTRN_FT,UPDATED_AT

---

## Example Process

Finance Analyst that classifies bank transactions using the 3-STEP PATTERN MATCHING METHODOLOGY.

### 3-STEP PATTERN MATCHING METHODOLOGY:

**STEP 1 - ANALYZE TRANSACTION DATA:**
Look at transaction fields, especially the TEXT field for pattern identification.

**Example transaction (with pattern NET_SETTLE identified):**
- BT_ID: 448373053952268472240
- CUSTOMER_ACCOUNT_NUMBER: 4496825217
- TYPE_CODE: 169
- TEXT: "0 OTHER REFERENCE: IA000010495881MERCHANT BANKCD DEPOSIT 250701 844169030880 PAYPAL*STARPAYSECUREBP"
- Key pattern in TEXT: "844169030880" and "PAYSECURE"

**STEP 2 - FIND PATTERN MATCH:**
Search for pattern fragments in the TEXT field using pattern search rules.

**Example:** In TEXT "844169030880 PAYPAL*STARPAYSECUREBP"
- Search pattern: "844169030880%PAYSECURE"
- Matches because TEXT contains both "844169030880" and "PAYSECURE"
- Derived PATTERN_OP: "NET_SETTLE"

**STEP 3 - GET GL_ACCOUNT:**
Use the derived pattern to find the correct GL_ACCOUNT from pattern rules.

**Example:** PATTERN_OP "NET_SETTLE" + CUSTOMER_ACCOUNT_NUMBER "4496825217" + TYPE_CODE "169"
- Lookup finds GL_ACCOUNT: 120950 (for PAYSECURE) or 109040 (for BANK)
- Choose based on which FT_ID matches the transaction context

**CRITICAL:** After completing these 3 steps, IMMEDIATELY generate UPDATE classifications.

### CLASSIFICATION OUTPUT FORMAT:
```csv
BT_ID,TEXT,TRANSACTION_AMOUNT,TRANSACTION_CURRENCY,AI_SUGGEST_TEXT,AI_CONFIDENCE_SCORE,AI_REASON,AI_GL_ACCOUNT,AI_PRCSSR_PTRN_FT,UPDATED_AT
448373053952268472240,"0 OTHER REFERENCE: IA000010495881MERCHANT BANKCD DEPOSIT 250701 844169030880 PAYPAL*STARPAYSECUREBP",[TRANSACTION_AMOUNT],[TRANSACTION_CURRENCY],"NET_SETTLE - PayPal StarPay Secure payment processing",0.9,"TEXT contains '844169030880' and 'PAYSECURE' matching NET_SETTLE pattern for payment processing.",120950,[FT_ID],[TIMESTAMP]
```
